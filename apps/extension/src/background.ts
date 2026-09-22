import {
  PORTAL_ORIGIN,
  SITE_ORIGIN,
  type ExtensionEvent,
  type PortalExtensionState,
  parseSiteCommand,
  validateXmlPayload,
} from './protocol';
import { buildReplayRequest, shouldCapturePortalRequest } from './portal-request';
import { loadSupplierConfig, resolveSupplierFromConfig } from './supplier-store';

declare const chrome: any;

const ACTIVE_OPERATION_KEY = 'activePortalOperation';
const PORTAL_URL =
  'https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g%3D';
const PORTAL_DOWNLOAD_FILTER = {
  urls: ['https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx*'],
};

type ActiveOperation = {
  operationId: string;
  accessKey: string;
  siteTabId: number;
  portalTabId: number;
  portalWindowId: number;
  state: PortalExtensionState;
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
    return {
      type: 'ready',
      requestId: command.requestId,
      version: String(chrome.runtime.getManifest().version ?? '0.0.0'),
      capabilities: {
        portalLookup: true,
        supplierResolution: true,
      },
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
    const existing = await getReconciledActiveOperation();
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
    await transition(operation, 'waiting_user', 'Resolva o hCaptcha manualmente.');
    return { operationId: operation.operationId, accessKey: operation.accessKey };
  }

  if (type === 'submitting') {
    await transition(operation, 'submitting', 'hCaptcha resolvido. Consultando o Portal.');
    return { ok: true };
  }

  if (type === 'download_ready') {
    await armExpectedPortalDialog(operation.portalTabId);
    await transition(operation, 'waiting_result', 'Solicitando o XML oficial.');
    return { armed: true };
  }

  throw new Error('Mensagem do Portal não reconhecida.');
}

async function handlePortalDownload(details: any): Promise<void> {
  const operation = await getActiveOperation();
  if (!operation || details.tabId !== operation.portalTabId) return;
  if (!shouldCapturePortalRequest(details)) return;

  try {
    await transition(operation, 'fetching_xml', 'Recebendo o XML oficial.');
    const replay = buildReplayRequest(details);
    const response = await fetch(replay.url, replay.init);
    if (!response.ok) {
      throw new Error(`Portal retornou HTTP ${response.status} ao obter o XML.`);
    }

    const xml = validateXmlPayload(await response.text(), operation.accessKey);
    await finishOperation(operation, {
      type: 'completed',
      operationId: operation.operationId,
      xml,
    });
  } catch (error) {
    await finishOperation(operation, {
      type: 'failed',
      operationId: operation.operationId,
      code: 'portal_xml_capture_unavailable',
      message: error instanceof Error
        ? error.message
        : 'Não foi possível obter o XML pela sessão do navegador.',
    });
  }
}

async function handleWindowRemoved(windowId: number): Promise<void> {
  const operation = await getActiveOperation();
  if (!operation || operation.portalWindowId !== windowId) return;

  await clearActiveOperation();
  await pushToSite(operation.siteTabId, {
    type: 'cancelled',
    operationId: operation.operationId,
    message: 'A janela do Portal foi fechada antes da conclusão.',
  });
}

async function handleTabRemoved(tabId: number): Promise<void> {
  const operation = await getActiveOperation();
  if (!operation) return;

  if (operation.portalTabId === tabId) {
    await clearActiveOperation();
    await pushToSite(operation.siteTabId, {
      type: 'cancelled',
      operationId: operation.operationId,
      message: 'A aba do Portal foi fechada antes da conclusão.',
    });
    return;
  }

  if (operation.siteTabId === tabId) {
    await clearActiveOperation();
    await chrome.windows.remove(operation.portalWindowId).catch(() => {});
  }
}

async function transition(
  operation: ActiveOperation,
  state: PortalExtensionState,
  message: string,
): Promise<void> {
  const next = { ...operation, state };
  await saveActiveOperation(next);
  await pushToSite(operation.siteTabId, {
    type: 'state',
    operationId: operation.operationId,
    state,
    message,
  });
}

async function finishOperation(
  operation: ActiveOperation,
  event: ExtensionEvent,
): Promise<void> {
  await clearActiveOperation();
  await pushToSite(operation.siteTabId, event);
  try {
    await chrome.windows.remove(operation.portalWindowId);
  } catch {
    // A janela pode ter sido fechada pelo usuário enquanto finalizávamos.
  }
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

  await clearActiveOperation();
  if (portalWindow) {
    await chrome.windows.remove(operation.portalWindowId).catch(() => {});
  }
  return null;
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
