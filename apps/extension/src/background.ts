import {
  PORTAL_ORIGIN,
  SITE_ORIGIN,
  type ExtensionEvent,
  type PortalExtensionState,
  parseSiteCommand,
  validateXmlPayload,
} from './protocol';
import { isLikelyHtmlDocument, isOfficialDownloadUrl } from './portal-dom';
import {
  buildPageReplayRequest,
  shouldCapturePortalRequest,
  type PageReplayRequest,
} from './portal-request';
import {
  blockFiscalUsage,
  checkFiscalUsage,
  loadFiscalIdentity,
  recordFiscalAttempt,
} from './fiscal-store';
import { lookupNfeDirect, type DirectLookupResult } from './sefaz-direct';
import { loadSupplierConfig, resolveSupplierFromConfig } from './supplier-store';

declare const chrome: any;

const ACTIVE_OPERATION_KEY = 'activePortalOperation';
const PORTAL_URL =
  'https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g%3D';
const PORTAL_DOWNLOAD_FILTER = {
  urls: ['https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx*'],
};

let operationMutationQueue: Promise<void> = Promise.resolve();

type ActiveOperation = {
  operationId: string;
  accessKey: string;
  siteTabId: number;
  portalTabId: number;
  portalWindowId: number;
  state: PortalExtensionState;
  stateChangedAt: number;
};

void hardenLocalStorage();
void reconcileActiveOperation();

chrome.runtime.onInstalled.addListener(() => {
  void hardenLocalStorage();
  void reconcileActiveOperation();
  void injectSiteBridgeIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void hardenLocalStorage();
  void reconcileActiveOperation();
  void injectSiteBridgeIntoOpenTabs();
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener(
  (message: unknown, sender: any, sendResponse: (response: unknown) => void) => {
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
  },
);

chrome.windows.onRemoved.addListener((windowId: number) => {
  void handleWindowRemoved(windowId);
});

chrome.tabs.onRemoved.addListener((tabId: number) => {
  void handleTabRemoved(tabId);
});

chrome.webRequest.onBeforeRequest.addListener(
  (details: any) => {
    void handlePortalDownload(details);
  },
  PORTAL_DOWNLOAD_FILTER,
  ['requestBody'],
);

async function hardenLocalStorage(): Promise<void> {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Fail-soft: versões Chromium compatíveis devem aceitar; não bloquear o fluxo por hardening.
  }
}

async function reconcileActiveOperation(): Promise<void> {
  await getReconciledActiveOperation();
}

async function injectSiteBridgeIntoOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: `${SITE_ORIGIN}/*` }).catch(() => []);
  await Promise.all(
    (tabs ?? []).map(async (tab: any) => {
      const tabId = tab?.id;
      if (!Number.isInteger(tabId)) return;

      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['site-bridge.js'],
        });
      } catch {
        // Aba fechada, bloqueada por política ou sem permissão: o próximo reload injeta pelo manifest.
      }
    }),
  );
}

async function handleMessage(message: unknown, sender: any): Promise<unknown> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new Error('Mensagem inválida.');
  }

  const envelope = message as Record<string, unknown>;
  if (envelope.source === 'site') {
    return handleSiteCommand(envelope.command, sender);
  }
  if (envelope.source === 'portal') {
    return handlePortalMessage(envelope, sender);
  }

  throw new Error('Origem da mensagem não reconhecida.');
}

async function handleSiteCommand(commandValue: unknown, sender: any): Promise<unknown> {
  assertSenderOrigin(sender, SITE_ORIGIN);
  const siteTabId = sender.tab?.id;
  if (!Number.isInteger(siteTabId)) throw new Error('A aba do site não pôde ser identificada.');

  const command = parseSiteCommand(commandValue);
  if (command.type === 'ping') {
    const fiscalIdentity = await loadFiscalIdentity();
    return {
      type: 'ready',
      requestId: command.requestId,
      version: String(chrome.runtime.getManifest().version ?? '0.0.0'),
      capabilities: {
        directLookup: true,
        portalLookup: true,
        supplierResolution: true,
      },
      configuration: {
        fiscalIdentityConfigured: fiscalIdentity !== null,
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

  if (command.type === 'direct_lookup') {
    return {
      type: 'direct_lookup_result',
      requestId: command.requestId,
      result: await handleDirectLookup(command.accessKey),
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
        throw new ExtensionFailure(
          'portal_operation_active',
          'Já existe uma consulta pelo Portal em andamento.',
        );
      }

      const operationId = globalThis.crypto.randomUUID();
      let popup: any;
      try {
        popup = await chrome.windows.create({
          url: 'about:blank',
          type: 'popup',
          focused: true,
          width: 1100,
          height: 800,
        });
      } catch {
        throw new ExtensionFailure(
          'portal_popup_open_failed',
          'Não foi possível abrir a janela do Portal.',
        );
      }

      const portalWindowId = popup?.id;
      if (!Number.isInteger(portalWindowId)) {
        throw new ExtensionFailure(
          'portal_popup_open_failed',
          'Não foi possível identificar a janela do Portal.',
        );
      }

      const popupTabs = await chrome.tabs.query({ windowId: portalWindowId }).catch(() => []);
      const portalTabId = popupTabs?.[0]?.id;
      if (!Number.isInteger(portalTabId)) {
        await chrome.windows.remove(portalWindowId).catch(() => {});
        throw new ExtensionFailure(
          'portal_tab_missing',
          'Não foi possível identificar a aba do Portal.',
        );
      }

      const operation: ActiveOperation = {
        operationId,
        accessKey: command.accessKey,
        siteTabId,
        portalTabId,
        portalWindowId,
        state: 'opening',
        stateChangedAt: Date.now(),
      };

      try {
        await saveActiveOperation(operation);
      } catch {
        await chrome.windows.remove(portalWindowId).catch(() => {});
        throw new ExtensionFailure(
          'portal_state_unavailable',
          'Não foi possível salvar o estado da consulta do Portal.',
        );
      }

      try {
        await chrome.tabs.update(portalTabId, { url: PORTAL_URL });
      } catch {
        await clearActiveOperation();
        await chrome.windows.remove(portalWindowId).catch(() => {});
        throw new ExtensionFailure(
          'portal_navigation_failed',
          'Não foi possível abrir o Portal Nacional na aba criada.',
        );
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

async function handleDirectLookup(accessKey: string): Promise<DirectLookupResult> {
  const identity = await loadFiscalIdentity();
  if (!identity) {
    return {
      category: 'configuration_error',
      xml: null,
      cStat: null,
      message: 'Configure uma vez o CNPJ do certificado A1 nas opções da extensão.',
    };
  }

  let decision;
  try {
    decision = await checkFiscalUsage(identity.cnpj);
  } catch {
    return {
      category: 'consumption_limit',
      xml: null,
      cStat: null,
      message: 'A proteção fiscal local não pôde ser validada. A consulta direta foi bloqueada por segurança.',
    };
  }

  if (!decision.allowDirectLookup) {
    const localTime = decision.blockedUntilUtc
      ? new Date(decision.blockedUntilUtc).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'mais tarde';
    return {
      category: 'consumption_limit',
      xml: null,
      cStat: null,
      message: `Proteção fiscal local ativa até ${localTime}. A SEFAZ não foi consultada novamente.`,
    };
  }

  try {
    await recordFiscalAttempt(identity.cnpj);
  } catch {
    return {
      category: 'consumption_limit',
      xml: null,
      cStat: null,
      message: 'Não foi possível registrar a proteção fiscal local. A SEFAZ não foi consultada.',
    };
  }

  const result = await lookupNfeDirect(accessKey, identity.cnpj);
  if (result.category === 'consumption_limit') {
    await blockFiscalUsage(identity.cnpj).catch(() => {});
  }
  return result;
}

async function handlePortalMessage(
  envelope: Record<string, unknown>,
  sender: any,
): Promise<unknown> {
  assertSenderOrigin(sender, PORTAL_ORIGIN);
  const operation = await getActiveOperation();
  if (!operation) {
    throw new ExtensionFailure(
      'portal_operation_lost',
      'A operação do Portal não está mais disponível na extensão.',
    );
  }
  if (sender.tab?.id !== operation.portalTabId) {
    throw new ExtensionFailure(
      'portal_tab_mismatch',
      'Esta aba não pertence à operação Portal ativa.',
    );
  }

  const type = envelope.type;
  if (type === 'ready') {
    let activeOperation = operation;
    if (operation.state === 'opening' || operation.state === 'loading_portal') {
      activeOperation = await transition(
        operation,
        'waiting_user',
        'Resolva o hCaptcha manualmente.',
      );
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
      throw new ExtensionFailure(
        'portal_state_invalid',
        'O Portal não está no estado esperado para iniciar a consulta.',
      );
    }

    await transition(operation, 'submitting', 'hCaptcha resolvido. Consultando o Portal.');
    return { ok: true, state: 'submitting' };
  }

  if (type === 'download_ready') {
    if (operation.state === 'waiting_result' || operation.state === 'fetching_xml') {
      return { armed: true, state: operation.state };
    }
    if (operation.state !== 'submitting') {
      throw new ExtensionFailure(
        'portal_state_invalid',
        'O Portal não está no estado esperado para solicitar o XML.',
      );
    }

    try {
      await armExpectedPortalDialog(operation.portalTabId);
    } catch {
      throw new ExtensionFailure(
        'portal_dialog_arm_failed',
        'Não foi possível preparar a confirmação oficial de download do Portal.',
      );
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

  throw new ExtensionFailure(
    'portal_message_unknown',
    'Mensagem do Portal não reconhecida.',
  );
}

async function handlePortalDownload(details: any): Promise<void> {
  const operation = await claimPortalDownload(details);
  if (!operation) return;

  await pushToSite(operation.siteTabId, {
    type: 'state',
    operationId: operation.operationId,
    state: 'fetching_xml',
    message: 'Recebendo o XML oficial.',
  });

  try {
    let replay: PageReplayRequest;
    try {
      replay = buildPageReplayRequest(details);
    } catch (error) {
      throw new ExtensionFailure(
        'portal_request_replay_invalid',
        error instanceof Error
          ? error.message
          : 'A requisição oficial de download não pôde ser reproduzida com segurança.',
      );
    }

    const response = await fetchPortalXmlInPage(operation.portalTabId, replay);

    if (response.status === 401 || response.status === 403) {
      throw new ExtensionFailure(
        'portal_session_lost',
        'A sessão do Portal não autorizou o download do XML.',
      );
    }

    if (!response.ok) {
      throw new ExtensionFailure(
        'portal_download_http_error',
        `Portal retornou HTTP ${response.status} ao obter o XML.`,
      );
    }

    if (response.redirected && !isOfficialDownloadUrl(response.url)) {
      throw new ExtensionFailure(
        'portal_session_lost',
        'O Portal redirecionou o download para fora do endpoint oficial esperado.',
      );
    }

    const payload = response.payload;
    if (isLikelyHtmlDocument(payload)) {
      throw new ExtensionFailure(
        'portal_session_lost',
        'O Portal devolveu uma página HTML no lugar do XML; a sessão pode ter expirado.',
      );
    }

    let xml: string;
    try {
      xml = validateXmlPayload(payload, operation.accessKey);
    } catch (error) {
      throw new ExtensionFailure(
        'portal_xml_invalid',
        error instanceof Error ? error.message : 'O Portal devolveu um XML inválido.',
      );
    }

    await finishOperation(operation, {
      type: 'completed',
      operationId: operation.operationId,
      xml,
    });
  } catch (error) {
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

type PortalPageFetchResult = Readonly<{
  ok: boolean;
  status: number;
  redirected: boolean;
  url: string;
  payload: string;
}>;

async function fetchPortalXmlInPage(
  tabId: number,
  request: PageReplayRequest,
): Promise<PortalPageFetchResult> {
  let injection: any[];
  try {
    injection = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [request],
      func: async (input: PageReplayRequest) => {
        try {
          let body: BodyInit | undefined;
          if (input.body?.encoding === 'text') {
            body = input.body.value;
          } else if (input.body?.encoding === 'base64') {
            const binary = atob(input.body.value);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
              bytes[index] = binary.charCodeAt(index);
            }
            body = bytes;
          }

          const response = await fetch(input.url, {
            method: input.method,
            headers: input.headers,
            body,
            credentials: 'include',
            redirect: 'follow',
            cache: 'no-store',
          });

          return {
            ok: response.ok,
            status: response.status,
            redirected: response.redirected,
            url: response.url,
            payload: await response.text(),
            networkError: null,
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            redirected: false,
            url: input.url,
            payload: '',
            networkError: error instanceof Error ? error.message : 'Falha de rede no Portal.',
          };
        }
      },
    });
  } catch {
    throw new ExtensionFailure(
      'portal_xml_capture_unavailable',
      'Não foi possível executar o download dentro da sessão atual do Portal.',
    );
  }

  const result = injection?.[0]?.result;
  if (
    !result ||
    typeof result !== 'object' ||
    typeof result.status !== 'number' ||
    typeof result.url !== 'string' ||
    typeof result.payload !== 'string'
  ) {
    throw new ExtensionFailure(
      'portal_xml_capture_unavailable',
      'O Portal não devolveu uma resposta válida para a captura do XML.',
    );
  }

  if (typeof result.networkError === 'string' && result.networkError) {
    throw new ExtensionFailure(
      'portal_xml_capture_unavailable',
      'Não foi possível acessar o download oficial pela sessão atual do Portal.',
    );
  }

  return {
    ok: Boolean(result.ok),
    status: result.status,
    redirected: Boolean(result.redirected),
    url: result.url,
    payload: result.payload,
  };
}

async function handleWindowRemoved(windowId: number): Promise<void> {
  const operation = await getActiveOperation();
  if (!operation || operation.portalWindowId !== windowId) return;

  await finishOperation(operation, {
    type: 'cancelled',
    operationId: operation.operationId,
    message: 'A janela do Portal foi fechada antes da conclusão.',
  });
}

async function handleTabRemoved(tabId: number): Promise<void> {
  const operation = await getActiveOperation();
  if (!operation) return;

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

async function transition(
  operation: ActiveOperation,
  state: PortalExtensionState,
  message: string,
): Promise<ActiveOperation> {
  let changed = false;
  const next = await withOperationMutation(async () => {
    const current = await getActiveOperation();
    if (!current || current.operationId !== operation.operationId) {
      throw new ExtensionFailure(
        'portal_operation_lost',
        'A operação do Portal não está mais disponível na extensão.',
      );
    }

    if (current.state === state) return current;
    if (current.state !== operation.state) {
      throw new ExtensionFailure(
        'portal_state_invalid',
        'A operação do Portal mudou enquanto a ação estava em andamento.',
      );
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

async function claimPortalDownload(details: any): Promise<ActiveOperation | null> {
  if (!shouldCapturePortalRequest(details)) return null;

  return withOperationMutation(async () => {
    const operation = await getActiveOperation();
    if (!operation || details.tabId !== operation.portalTabId) return null;
    if (operation.state !== 'waiting_result') return null;

    const next = {
      ...operation,
      state: 'fetching_xml' as const,
      stateChangedAt: Date.now(),
    };
    await saveActiveOperation(next);
    return next;
  });
}

async function finishOperation(
  operation: ActiveOperation,
  event: ExtensionEvent,
): Promise<boolean> {
  const current = await withOperationMutation(async () => {
    const active = await getActiveOperation();
    if (!active || active.operationId !== operation.operationId) return null;
    await clearActiveOperation();
    return active;
  });

  if (!current) return false;

  await pushToSite(current.siteTabId, event);
  try {
    await chrome.windows.remove(current.portalWindowId);
  } catch {
    // A janela pode ter sido fechada pelo usuário enquanto finalizávamos.
  }
  return true;
}

async function pushToSite(siteTabId: number, event: ExtensionEvent): Promise<void> {
  try {
    await chrome.tabs.sendMessage(siteTabId, { source: 'background', event });
  } catch {
    // Site recarregado/fechado: não há destino para o evento.
  }
}

async function getActiveOperation(): Promise<ActiveOperation | null> {
  const stored = await chrome.storage.session.get(ACTIVE_OPERATION_KEY);
  const value = stored?.[ACTIVE_OPERATION_KEY];
  if (isActiveOperation(value)) return value;
  if (value !== undefined) await clearActiveOperation();
  return null;
}

async function getReconciledActiveOperation(): Promise<ActiveOperation | null> {
  const operation = await getActiveOperation();
  if (!operation) return null;

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
  const siteOrigin = parseOrigin(siteUrl);
  const valid = Boolean(
    portalWindow &&
    portalTab &&
    siteTab &&
    portalTab.windowId === operation.portalWindowId &&
    portalUrlAllowed &&
    siteOrigin === SITE_ORIGIN
  );

  if (valid) return operation;

  const cleared = await clearActiveOperationIfCurrent(operation.operationId);
  if (cleared && portalWindow) {
    await chrome.windows.remove(operation.portalWindowId).catch(() => {});
  }
  return null;
}

async function clearActiveOperationIfCurrent(operationId: string): Promise<boolean> {
  return withOperationMutation(async () => {
    const current = await getActiveOperation();
    if (!current || current.operationId !== operationId) return false;
    await clearActiveOperation();
    return true;
  });
}

async function withOperationMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const previous = operationMutationQueue;
  let release!: () => void;
  operationMutationQueue = new Promise<void>((resolve) => {
    release = () => resolve();
  });

  await previous;
  try {
    return await mutation();
  } finally {
    release();
  }
}

async function saveActiveOperation(operation: ActiveOperation): Promise<void> {
  await chrome.storage.session.set({ [ACTIVE_OPERATION_KEY]: operation });
}

async function clearActiveOperation(): Promise<void> {
  await chrome.storage.session.remove(ACTIVE_OPERATION_KEY);
}

function isActiveOperation(value: unknown): value is ActiveOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
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

function parseOrigin(value: string): string {
  if (!value || value === 'about:blank') return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

class ExtensionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExtensionFailure';
  }
}

function assertSenderOrigin(sender: any, expectedOrigin: string): void {
  const value = sender?.url ?? sender?.tab?.url;
  if (typeof value !== 'string') throw new Error('Origem da mensagem ausente.');

  let origin = '';
  try {
    origin = new URL(value).origin;
  } catch {
    throw new Error('Origem da mensagem inválida.');
  }
  if (origin !== expectedOrigin) throw new Error('Origem da mensagem não autorizada.');
}

async function armExpectedPortalDialog(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const originalAlert = window.alert.bind(window);
      const originalConfirm = window.confirm.bind(window);
      const deadline = Date.now() + 60_000;

      const expected = (message?: string) => {
        if (Date.now() > deadline) return false;
        const normalized = String(message ?? '').toLocaleLowerCase('pt-BR');
        return normalized.includes('download') && normalized.includes('certificado digital');
      };

      window.alert = (message?: string) => {
        if (!expected(message)) originalAlert(message);
      };
      window.confirm = (message?: string) => {
        if (expected(message)) return true;
        return originalConfirm(message);
      };

      window.setTimeout(() => {
        window.alert = originalAlert;
        window.confirm = originalConfirm;
      }, 60_000);
    },
  });
}
