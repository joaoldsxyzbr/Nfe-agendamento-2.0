import { PORTAL_ORIGIN, MAX_XML_BYTES, parseAppCommand, validateXmlPayload, } from './protocol';
import { isLikelyHtmlDocument, isOfficialDownloadUrl } from './portal-dom';
import { capturePortalXmlPage } from './portal-fetch';
import { buildPageReplayRequest, shouldCapturePortalRequest, } from './portal-request';
import { SUPPLIER_CONFIG_KEY, invalidateSupplierConfigCache, loadSupplierConfig, resolveSupplierFromConfig, } from './supplier-store';
import { PORTAL_POPUP_WIDTH, PORTAL_POPUP_HEIGHT } from './shared/constants.js';
const ACTIVE_OPERATION_KEY = 'activePortalOperation';
const PORTAL_URL = 'https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g%3D';
const PORTAL_DOWNLOAD_FILTER = {
    urls: ['https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx*'],
};
let operationMutationQueue = Promise.resolve();
let openingAppWindow = null;
void hardenLocalStorage();
void reconcileActiveOperation();
chrome.runtime.onInstalled.addListener(() => {
    void hardenLocalStorage();
    void reconcileActiveOperation();
});
chrome.runtime.onStartup.addListener(() => {
    void hardenLocalStorage();
    void reconcileActiveOperation();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, SUPPLIER_CONFIG_KEY)) {
        invalidateSupplierConfigCache();
    }
});
chrome.action.onClicked.addListener(() => {
    if (openingAppWindow) return;
    openingAppWindow = openAppPopup()
        .catch((error) => {
            console.error('Falha ao abrir a janela do NFe Agendamento.', error);
        })
        .finally(() => { openingAppWindow = null; });
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.source === 'background') return false;
    void handleMessage(message, sender)
        .then(sendResponse)
        .catch((error) => {
        sendResponse({
            type: 'failed',
            code: error instanceof ExtensionFailure ? error.code : 'extension_error',
            message: error instanceof Error ? error.message : 'Falha inesperada na extensão.',
        });
    });
    return true;
});
chrome.windows.onRemoved.addListener((windowId) => {
    void handleWindowRemoved(windowId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
    void handleTabRemoved(tabId);
});
chrome.webRequest.onBeforeRequest.addListener((details) => {
    void handlePortalDownload(details);
}, PORTAL_DOWNLOAD_FILTER, ['requestBody']);
async function hardenLocalStorage() {
    try {
        await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    }
    catch {
        // Fail-soft: versões Chromium compatíveis devem aceitar; não bloquear o fluxo por hardening.
    }
}
async function reconcileActiveOperation() {
    await getReconciledActiveOperation();
}
async function openAppPopup() {
    const url = chrome.runtime.getURL('app.html');
    const tabs = await chrome.tabs.query({ url }).catch(() => []);
    for (const tab of tabs) {
        if (!Number.isInteger(tab.windowId)) continue;
        const existingWindow = await chrome.windows.get(tab.windowId).catch(() => null);
        if (existingWindow?.type !== 'popup' || !Number.isInteger(existingWindow.id)) continue;
        await chrome.windows.update(existingWindow.id, { focused: true });
        return;
    }

    // Não adiciona permissões: usa o tamanho da janela normal do navegador como referência.
    const reference = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null);
    const availableWidth = Number.isInteger(reference?.width) && reference.width > 0 ? reference.width : null;
    const availableHeight = Number.isInteger(reference?.height) && reference.height > 0 ? reference.height : null;
    const width = availableWidth === null ? 840 : Math.min(availableWidth, Math.max(680, Math.round(availableWidth / 2)));
    const height = availableHeight === null ? 760 : Math.min(availableHeight, Math.max(620, Math.round(availableHeight * 0.85)));
    const bounds = { width, height };
    if (Number.isInteger(reference?.left) && availableWidth !== null)
        bounds.left = reference.left + Math.floor((availableWidth - width) / 2);
    if (Number.isInteger(reference?.top) && availableHeight !== null)
        bounds.top = reference.top + Math.floor((availableHeight - height) / 2);
    await chrome.windows.create({ url, type: 'popup', focused: true, ...bounds });
}

async function handleMessage(message, sender) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
        throw new Error('Mensagem inválida.');
    }
    const envelope = message;
    if (envelope.source === 'app') {
        return handleAppCommand(envelope.command, sender, envelope.appTabId);
    }
    if (envelope.source === 'portal') {
        return handlePortalMessage(envelope, sender);
    }
    throw new Error('Origem da mensagem não reconhecida.');
}
async function handleAppCommand(commandValue, sender, claimedTabId) {
    const appUrl = chrome.runtime.getURL('app.html');
    if (sender.id !== chrome.runtime.id || sender.url !== appUrl)
        throw new Error('Origem da mensagem não autorizada.');
    const siteTabId = sender.tab?.id ?? claimedTabId;
    if (!Number.isInteger(siteTabId) || (sender.tab?.id !== undefined && sender.tab.id !== claimedTabId))
        throw new Error('A janela do NFe Agendamento não pôde ser identificada.');
    const appTab = await chrome.tabs.get(siteTabId).catch(() => null);
    if (!appTab || appTab.url !== appUrl)
        throw new Error('A janela do NFe Agendamento não foi autorizada.');
    const command = parseAppCommand(commandValue);
    if (command.type === 'ping') {
        return {
            type: 'ready',
            requestId: command.requestId,
            version: String(chrome.runtime.getManifest().version ?? '0.0.0'),
            capabilities: {
                openOptions: true,
                portalLookup: true,
                supplierResolution: true,
            },
        };
    }
    if (command.type === 'open_options') {
        await chrome.runtime.openOptionsPage();
        return {
            type: 'options_opened',
            requestId: command.requestId,
        };
    }
    if (command.type === 'resolve_supplier') {
        return {
            type: 'supplier_resolved',
            requestId: command.requestId,
            supplierId: resolveSupplierFromConfig(await loadSupplierConfig(), command.taxId),
        };
    }
    if (command.type === 'status') {
        const operation = await getReconciledActiveOperation();
        const matches = operation?.operationId === command.operationId;
        return {
            type: 'operation_status',
            requestId: command.requestId,
            operationId: command.operationId,
            active: matches,
            state: matches ? operation.state : null,
        };
    }
    if (command.type === 'start') {
        await getReconciledActiveOperation();
        return withOperationMutation(async () => {
            const existing = await getActiveOperation();
            if (existing) {
                if (existing.siteTabId === siteTabId && existing.accessKey === command.accessKey) {
                    return {
                        type: 'started',
                        requestId: command.requestId,
                        operationId: existing.operationId,
                        resumed: true,
                    };
                }
                throw new ExtensionFailure('portal_operation_active', 'Já existe uma consulta pelo Portal em andamento.');
            }
            const operationId = globalThis.crypto.randomUUID();
            let popup;
            try {
                popup = await chrome.windows.create({
                    url: 'about:blank',
                    type: 'popup',
                    focused: true,
                    width: PORTAL_POPUP_WIDTH,
                    height: PORTAL_POPUP_HEIGHT,
                });
            }
            catch {
                throw new ExtensionFailure('portal_popup_open_failed', 'Não foi possível abrir a janela do Portal.');
            }
            const portalWindowId = popup?.id;
            if (!Number.isInteger(portalWindowId)) {
                throw new ExtensionFailure('portal_popup_open_failed', 'Não foi possível identificar a janela do Portal.');
            }
            const popupTabs = await chrome.tabs.query({ windowId: portalWindowId }).catch(() => []);
            const portalTabId = popupTabs?.[0]?.id;
            if (!Number.isInteger(portalTabId)) {
                await chrome.windows.remove(portalWindowId).catch(() => { });
                throw new ExtensionFailure('portal_tab_missing', 'Não foi possível identificar a aba do Portal.');
            }
            const operation = {
                operationId,
                accessKey: command.accessKey,
                siteTabId,
                clientType: 'app',
                portalTabId,
                portalWindowId,
                state: 'opening',
                stateChangedAt: Date.now(),
            };
            try {
                await saveActiveOperation(operation);
            }
            catch {
                await chrome.windows.remove(portalWindowId).catch(() => { });
                throw new ExtensionFailure('portal_state_unavailable', 'Não foi possível salvar o estado da consulta do Portal.');
            }
            try {
                await chrome.tabs.update(portalTabId, { url: PORTAL_URL });
            }
            catch {
                await clearActiveOperation();
                await chrome.windows.remove(portalWindowId).catch(() => { });
                throw new ExtensionFailure('portal_navigation_failed', 'Não foi possível abrir o Portal Nacional na aba criada.');
            }
            return {
                type: 'started',
                requestId: command.requestId,
                operationId,
            };
        });
    }
    const operation = await getReconciledActiveOperation();
    if (!operation || operation.operationId !== command.operationId) {
        return {
            type: 'cancelled',
            requestId: command.requestId,
            operationId: command.operationId,
        };
    }
    await finishOperation(operation, {
        type: 'cancelled',
        operationId: operation.operationId,
        message: 'Consulta pelo Portal cancelada.',
    });
    return {
        type: 'cancelled',
        requestId: command.requestId,
        operationId: command.operationId,
    };
}
async function handlePortalMessage(envelope, sender) {
    assertSenderOrigin(sender, PORTAL_ORIGIN);
    const operation = await getActiveOperation();
    if (!operation) {
        throw new ExtensionFailure('portal_operation_lost', 'A operação do Portal não está mais disponível na extensão.');
    }
    if (sender.tab?.id !== operation.portalTabId) {
        throw new ExtensionFailure('portal_tab_mismatch', 'Esta aba não pertence à operação Portal ativa.');
    }
    const type = envelope.type;
    if (type === 'ready') {
        let activeOperation = operation;
        if (operation.state === 'opening' || operation.state === 'loading_portal') {
            activeOperation = await transition(operation, 'waiting_user', 'Resolva o hCaptcha manualmente.');
        }
        return {
            operationId: activeOperation.operationId,
            accessKey: activeOperation.accessKey,
            state: activeOperation.state,
            stateChangedAt: activeOperation.stateChangedAt,
        };
    }
    if (type === 'submitting') {
        if (operation.state === 'submitting') {
            return { ok: true, state: operation.state };
        }
        if (operation.state !== 'waiting_user') {
            throw new ExtensionFailure('portal_state_invalid', 'O Portal não está no estado esperado para iniciar a consulta.');
        }
        await transition(operation, 'submitting', 'hCaptcha resolvido. Consultando o Portal.');
        return { ok: true, state: 'submitting' };
    }
    if (type === 'download_ready') {
        if (operation.state === 'waiting_result' || operation.state === 'fetching_xml') {
            return { armed: true, state: operation.state };
        }
        if (operation.state !== 'submitting') {
            throw new ExtensionFailure('portal_state_invalid', 'O Portal não está no estado esperado para solicitar o XML.');
        }
        try {
            await armExpectedPortalDialog(operation.portalTabId);
        }
        catch {
            throw new ExtensionFailure('portal_dialog_arm_failed', 'Não foi possível preparar a confirmação oficial de download do Portal.');
        }
        await transition(operation, 'waiting_result', 'Solicitando o XML oficial.');
        return { armed: true, state: 'waiting_result' };
    }
    if (type === 'result_timeout') {
        if (operation.state !== 'submitting') {
            return { handled: false, state: operation.state };
        }
        await finishOperation(operation, {
            type: 'failed',
            operationId: operation.operationId,
            code: 'portal_download_not_found',
            message: 'O Portal não exibiu o download do documento dentro do tempo esperado.',
        });
        return { handled: true, state: 'failed' };
    }
    if (type === 'download_timeout') {
        if (operation.state !== 'waiting_result') {
            return { handled: false, state: operation.state };
        }
        await finishOperation(operation, {
            type: 'failed',
            operationId: operation.operationId,
            code: 'portal_download_request_missing',
            message: 'O Portal não iniciou a requisição oficial do XML dentro do tempo esperado.',
        });
        return { handled: true, state: 'failed' };
    }
    throw new ExtensionFailure('portal_message_unknown', 'Mensagem do Portal não reconhecida.');
}
async function handlePortalDownload(details) {
    const operation = await claimPortalDownload(details);
    if (!operation)
        return;
    await pushToSite(operation.siteTabId, {
        type: 'state',
        operationId: operation.operationId,
        state: 'fetching_xml',
        message: 'Recebendo o XML oficial.',
    });
    try {
        let replay;
        try {
            replay = buildPageReplayRequest(details);
        }
        catch (error) {
            throw new ExtensionFailure('portal_request_replay_invalid', error instanceof Error
                ? error.message
                : 'A requisição oficial de download não pôde ser reproduzida com segurança.');
        }
        const response = await fetchPortalXmlInPage(operation.portalTabId, replay);
        if (response.status === 401 || response.status === 403) {
            throw new ExtensionFailure('portal_session_lost', 'A sessão do Portal não autorizou o download do XML.');
        }
        if (!response.ok) {
            throw new ExtensionFailure('portal_download_http_error', `Portal retornou HTTP ${response.status} ao obter o XML.`);
        }
        if (response.redirected && !isOfficialDownloadUrl(response.url)) {
            throw new ExtensionFailure('portal_session_lost', 'O Portal redirecionou o download para fora do endpoint oficial esperado.');
        }
        const payload = response.payload;
        if (isLikelyHtmlDocument(payload)) {
            throw new ExtensionFailure('portal_session_lost', 'O Portal devolveu uma página HTML no lugar do XML; a sessão pode ter expirado.');
        }
        let xml;
        try {
            xml = validateXmlPayload(payload, operation.accessKey);
        }
        catch (error) {
            throw new ExtensionFailure('portal_xml_invalid', error instanceof Error ? error.message : 'O Portal devolveu um XML inválido.');
        }
        await finishOperation(operation, {
            type: 'completed',
            operationId: operation.operationId,
            xml,
        });
    }
    catch (error) {
        await finishOperation(operation, {
            type: 'failed',
            operationId: operation.operationId,
            code: error instanceof ExtensionFailure
                ? error.code
                : 'portal_xml_capture_unavailable',
            message: error instanceof Error
                ? error.message
                : 'Não foi possível obter o XML pela sessão do navegador.',
        });
    }
}
async function fetchPortalXmlInPage(tabId, request) {
    let injection;
    try {
        injection = await chrome.scripting.executeScript({
            target: { tabId },
            // Mesmo MAIN world e fetch/resposta textual usados na extensão 0.2.13 funcional.
            world: 'MAIN',
            args: [request, MAX_XML_BYTES],
            func: capturePortalXmlPage,
        });
    }
    catch {
        throw new ExtensionFailure('portal_xml_capture_unavailable', 'Não foi possível executar o download dentro da sessão atual do Portal.');
    }
    const result = injection?.[0]?.result;
    if (!result ||
        typeof result !== 'object' ||
        typeof result.status !== 'number' ||
        typeof result.url !== 'string' ||
        typeof result.payload !== 'string') {
        throw new ExtensionFailure('portal_xml_capture_unavailable', 'O Portal não devolveu uma resposta válida para a captura do XML.');
    }
    if (result.errorCode === 'portal_xml_too_large') {
        throw new ExtensionFailure('portal_xml_too_large', 'XML excede 10 MiB.');
    }
    if (typeof result.networkError === 'string' && result.networkError) {
        throw new ExtensionFailure('portal_xml_capture_unavailable', 'Não foi possível acessar o download oficial pela sessão atual do Portal.');
    }
    return {
        ok: Boolean(result.ok),
        status: result.status,
        redirected: Boolean(result.redirected),
        url: result.url,
        payload: result.payload,
        networkError: null,
        errorCode: null,
    };
}
async function handleWindowRemoved(windowId) {
    const operation = await getActiveOperation();
    if (!operation || operation.portalWindowId !== windowId)
        return;
    await finishOperation(operation, {
        type: 'cancelled',
        operationId: operation.operationId,
        message: 'A janela do Portal foi fechada antes da conclusão.',
    });
}
async function handleTabRemoved(tabId) {
    const operation = await getActiveOperation();
    if (!operation)
        return;
    if (operation.portalTabId === tabId) {
        await finishOperation(operation, {
            type: 'cancelled',
            operationId: operation.operationId,
            message: 'A aba do Portal foi fechada antes da conclusão.',
        });
        return;
    }
    if (operation.siteTabId === tabId) {
        await finishOperation(operation, {
            type: 'cancelled',
            operationId: operation.operationId,
            message: 'A aba do NFe Agendamento foi fechada antes da conclusão.',
        });
    }
}
async function transition(operation, state, message) {
    let changed = false;
    const next = await withOperationMutation(async () => {
        const current = await getActiveOperation();
        if (!current || current.operationId !== operation.operationId) {
            throw new ExtensionFailure('portal_operation_lost', 'A operação do Portal não está mais disponível na extensão.');
        }
        if (current.state === state)
            return current;
        if (current.state !== operation.state) {
            throw new ExtensionFailure('portal_state_invalid', 'A operação do Portal mudou enquanto a ação estava em andamento.');
        }
        const updated = { ...current, state, stateChangedAt: Date.now() };
        await saveActiveOperation(updated);
        changed = true;
        return updated;
    });
    if (changed) {
        await pushToSite(next.siteTabId, {
            type: 'state',
            operationId: next.operationId,
            state,
            message,
        });
    }
    return next;
}
async function claimPortalDownload(details) {
    if (!shouldCapturePortalRequest(details))
        return null;
    return withOperationMutation(async () => {
        const operation = await getActiveOperation();
        if (!operation || details.tabId !== operation.portalTabId)
            return null;
        if (operation.state !== 'waiting_result')
            return null;
        const next = {
            ...operation,
            state: 'fetching_xml',
            stateChangedAt: Date.now(),
        };
        await saveActiveOperation(next);
        return next;
    });
}
async function finishOperation(operation, event) {
    const current = await withOperationMutation(async () => {
        const active = await getActiveOperation();
        if (!active || active.operationId !== operation.operationId)
            return null;
        await clearActiveOperation();
        return active;
    });
    if (!current)
        return false;
    await pushToSite(current.siteTabId, event);
    try {
        await chrome.windows.remove(current.portalWindowId);
    }
    catch {
        // A janela pode ter sido fechada pelo usuário enquanto finalizávamos.
    }
    return true;
}
async function pushToSite(siteTabId, event) {
    try {
        await chrome.runtime.sendMessage({ source: 'background', siteTabId, event });
    }
    catch {
        // A janela pode ter sido fechada: o evento não tem destinatário.
    }
}
async function getActiveOperation() {
    const stored = await chrome.storage.session.get(ACTIVE_OPERATION_KEY);
    const value = stored?.[ACTIVE_OPERATION_KEY];
    if (isActiveOperation(value))
        return value;
    if (value !== undefined)
        await clearActiveOperation();
    return null;
}
async function getReconciledActiveOperation() {
    const operation = await getActiveOperation();
    if (!operation)
        return null;
    const [portalWindow, portalTab, siteTab] = await Promise.all([
        chrome.windows.get(operation.portalWindowId).catch(() => null),
        chrome.tabs.get(operation.portalTabId).catch(() => null),
        chrome.tabs.get(operation.siteTabId).catch(() => null),
    ]);
    const portalUrl = typeof portalTab?.url === 'string' ? portalTab.url : '';
    const portalOrigin = parseOrigin(portalUrl);
    const portalUrlAllowed = portalUrl === '' ||
        portalUrl === 'about:blank' ||
        portalOrigin === PORTAL_ORIGIN;
    const siteUrl = typeof siteTab?.url === 'string' ? siteTab.url : '';
    const validClient = siteUrl === chrome.runtime.getURL('app.html');
    const valid = Boolean(portalWindow &&
        portalTab &&
        siteTab &&
        portalTab.windowId === operation.portalWindowId &&
        portalUrlAllowed &&
        validClient);
    if (valid)
        return operation;
    const cleared = await clearActiveOperationIfCurrent(operation.operationId);
    if (cleared && portalWindow) {
        await chrome.windows.remove(operation.portalWindowId).catch(() => { });
    }
    return null;
}
async function clearActiveOperationIfCurrent(operationId) {
    return withOperationMutation(async () => {
        const current = await getActiveOperation();
        if (!current || current.operationId !== operationId)
            return false;
        await clearActiveOperation();
        return true;
    });
}
async function withOperationMutation(mutation) {
    const previous = operationMutationQueue;
    let release;
    operationMutationQueue = new Promise((resolve) => {
        release = () => resolve();
    });
    await previous;
    try {
        return await mutation();
    }
    finally {
        release();
    }
}
async function saveActiveOperation(operation) {
    await chrome.storage.session.set({ [ACTIVE_OPERATION_KEY]: operation });
}
async function clearActiveOperation() {
    await chrome.storage.session.remove(ACTIVE_OPERATION_KEY);
}
function isActiveOperation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const input = value;
    return typeof input.operationId === 'string' &&
        typeof input.accessKey === 'string' &&
        typeof input.siteTabId === 'number' &&
        Number.isInteger(input.siteTabId) &&
        typeof input.portalTabId === 'number' &&
        Number.isInteger(input.portalTabId) &&
        typeof input.portalWindowId === 'number' &&
        Number.isInteger(input.portalWindowId) &&
        typeof input.stateChangedAt === 'number' &&
        Number.isFinite(input.stateChangedAt) &&
        input.stateChangedAt > 0 &&
        typeof input.state === 'string' &&
        [
            'opening',
            'loading_portal',
            'waiting_user',
            'submitting',
            'waiting_result',
            'fetching_xml',
            'completed',
            'cancelled',
            'failed',
        ].includes(input.state);
}
function parseOrigin(value) {
    if (!value || value === 'about:blank')
        return '';
    try {
        return new URL(value).origin;
    }
    catch {
        return '';
    }
}
class ExtensionFailure extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'ExtensionFailure';
    }
}
function assertSenderOrigin(sender, expectedOrigin) {
    const value = sender?.url ?? sender?.tab?.url;
    if (typeof value !== 'string')
        throw new Error('Origem da mensagem ausente.');
    let origin = '';
    try {
        origin = new URL(value).origin;
    }
    catch {
        throw new Error('Origem da mensagem inválida.');
    }
    if (origin !== expectedOrigin)
        throw new Error('Origem da mensagem não autorizada.');
}
async function armExpectedPortalDialog(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
            const originalAlert = window.alert.bind(window);
            const originalConfirm = window.confirm.bind(window);
            const deadline = Date.now() + 60_000;
            const expected = (message) => {
                if (Date.now() > deadline)
                    return false;
                const normalized = String(message ?? '').toLocaleLowerCase('pt-BR');
                return normalized.includes('download') && normalized.includes('certificado digital');
            };
            window.alert = (message) => {
                if (!expected(message))
                    originalAlert(message);
            };
            window.confirm = (message) => {
                if (expected(message))
                    return true;
                return originalConfirm(message);
            };
            window.setTimeout(() => {
                window.alert = originalAlert;
                window.confirm = originalConfirm;
            }, 60_000);
        },
    });
}