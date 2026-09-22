import { PAGE_CHANNEL, SITE_ORIGIN, parseSiteCommand } from './protocol';

declare const chrome: any;

type PageEnvelope = {
  channel?: string;
  direction?: string;
  requestId?: string;
  command?: unknown;
};

type BridgeWindow = Window & {
  __nfeAgendamentoPortalBridgeLoaded?: boolean;
};

const bridgeWindow = window as BridgeWindow;

if (!bridgeWindow.__nfeAgendamentoPortalBridgeLoaded) {
  bridgeWindow.__nfeAgendamentoPortalBridgeLoaded = true;

  window.addEventListener('message', (event: MessageEvent<PageEnvelope>) => {
    if (event.source !== window || event.origin !== SITE_ORIGIN) return;
    const envelope = event.data;
    if (!envelope || envelope.channel !== PAGE_CHANNEL || envelope.direction !== 'request') return;

    void forwardRequest(envelope);
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const payload = message as Record<string, unknown>;
    if (payload.source !== 'background' || !payload.event) return;

    window.postMessage(
      {
        channel: PAGE_CHANNEL,
        direction: 'event',
        event: payload.event,
      },
      SITE_ORIGIN,
    );
  });
}

async function forwardRequest(envelope: PageEnvelope): Promise<void> {
  const requestId = typeof envelope.requestId === 'string' ? envelope.requestId : '';
  try {
    const command = parseSiteCommand(envelope.command);
    const response = await chrome.runtime.sendMessage({ source: 'site', command });
    window.postMessage(
      { channel: PAGE_CHANNEL, direction: 'response', requestId, response },
      SITE_ORIGIN,
    );
  } catch (error) {
    window.postMessage(
      {
        channel: PAGE_CHANNEL,
        direction: 'response',
        requestId,
        response: {
          type: 'failed',
          requestId,
          code: 'invalid_message',
          message: error instanceof Error ? error.message : 'Mensagem inválida.',
        },
      },
      SITE_ORIGIN,
    );
  }
}
