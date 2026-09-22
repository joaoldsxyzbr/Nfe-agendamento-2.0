import type { PortalOperationStatus } from '../bridge/contracts';

const SITE_ORIGIN = 'https://nfeagendamento.joaolds.xyz.br';
const PAGE_CHANNEL = 'nfe-agendamento:portal-extension';
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 1_200;
const HANDSHAKE_ATTEMPTS = 3;
const HANDSHAKE_RETRY_DELAY_MS = 200;

type ExtensionCommand =
  | { type: 'ping'; requestId: string }
  | { type: 'start'; requestId: string; accessKey: string }
  | { type: 'cancel'; requestId: string; operationId: string }
  | { type: 'resolve_supplier'; requestId: string; taxId: string };

export type PortalExtensionInfo = Readonly<{
  version: string;
  capabilities: Readonly<{
    portalLookup: true;
    supplierResolution: true;
  }>;
}>;

type ExtensionEvent =
  | { type: 'bridge_ready'; version: string }
  | { type: 'state'; operationId: string; state: string; message?: string }
  | { type: 'completed'; operationId: string; xml: string }
  | { type: 'failed'; operationId: string; code?: string; message: string }
  | { type: 'cancelled'; operationId: string; message?: string };

export interface PortalExtensionTransport {
  request(command: ExtensionCommand, signal?: AbortSignal): Promise<unknown>;
  subscribe(listener: (event: unknown) => void): () => void;
}

export class WindowPortalExtensionTransport implements PortalExtensionTransport {
  constructor(
    private readonly windowRef: Window = window,
    private readonly timeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
  ) {}

  request(command: ExtensionCommand, signal?: AbortSignal): Promise<unknown> {
    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(
        () => finish(() => reject(new Error('Extensão do Portal não respondeu.'))),
        this.timeoutMs,
      );

      const onAbort = () => finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')));
      const onMessage = (event: MessageEvent) => {
        if (event.source !== this.windowRef || event.origin !== SITE_ORIGIN) return;
        const envelope = event.data as Record<string, unknown> | null;
        if (!envelope ||
            envelope.channel !== PAGE_CHANNEL ||
            envelope.direction !== 'response' ||
            envelope.requestId !== command.requestId) {
          return;
        }
        finish(() => resolve(envelope.response));
      };

      const finish = (complete: () => void) => {
        globalThis.clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
        this.windowRef.removeEventListener('message', onMessage);
        complete();
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.windowRef.addEventListener('message', onMessage);
      this.windowRef.postMessage(
        {
          channel: PAGE_CHANNEL,
          direction: 'request',
          requestId: command.requestId,
          command,
        },
        SITE_ORIGIN,
      );
    });
  }

  subscribe(listener: (event: unknown) => void): () => void {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== this.windowRef || event.origin !== SITE_ORIGIN) return;
      const envelope = event.data as Record<string, unknown> | null;
      if (!envelope || envelope.channel !== PAGE_CHANNEL || envelope.direction !== 'event') return;
      listener(envelope.event);
    };
    this.windowRef.addEventListener('message', onMessage);
    return () => this.windowRef.removeEventListener('message', onMessage);
  }
}

export class BrowserPortalExtensionClient {
  constructor(private readonly transport: PortalExtensionTransport = new WindowPortalExtensionTransport()) {}

  async getInfo(signal?: AbortSignal): Promise<PortalExtensionInfo | null> {
    for (let attempt = 0; attempt < HANDSHAKE_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return null;
      const requestId = globalThis.crypto.randomUUID();

      try {
        const response = await this.transport.request({ type: 'ping', requestId }, signal);
        const info = parseReadyResponse(response);
        if (info) return info;
      } catch {
        if (signal?.aborted) return null;
      }

      if (attempt < HANDSHAKE_ATTEMPTS - 1) {
        await waitForHandshakeRetry(signal);
      }
    }

    return null;
  }

  async isAvailable(signal?: AbortSignal): Promise<boolean> {
    return (await this.getInfo(signal)) !== null;
  }

  onReadyHint(listener: (version: string) => void): () => void {
    return this.transport.subscribe((value) => {
      if (!isRecord(value) || value.type !== 'bridge_ready' || typeof value.version !== 'string') return;
      listener(value.version);
    });
  }

  async start(accessKey: string, signal?: AbortSignal): Promise<string> {
    const requestId = globalThis.crypto.randomUUID();
    const response = await this.transport.request(
      { type: 'start', requestId, accessKey: accessKey.trim().toUpperCase() },
      signal,
    );
    if (!isStartedResponse(response)) {
      throw new Error(messageFromFailure(response) ?? 'A extensão não iniciou o Portal.');
    }
    return response.operationId;
  }

  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus> {
    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const onAbort = () => finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')));

      const finish = (complete: () => void) => {
        signal?.removeEventListener('abort', onAbort);
        unsubscribe();
        complete();
      };

      unsubscribe = this.transport.subscribe((value) => {
        const event = parseTerminalEvent(value, operationId);
        if (!event) return;
        finish(() => resolve(event));
      });

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async cancel(operationId: string): Promise<void> {
    const requestId = globalThis.crypto.randomUUID();
    await this.transport.request({ type: 'cancel', requestId, operationId });
  }

  async resolveSupplier(taxId: string): Promise<{ supplierId: string | null }> {
    const requestId = globalThis.crypto.randomUUID();
    const response = await this.transport.request({ type: 'resolve_supplier', requestId, taxId });
    if (!isRecord(response) ||
        response.type !== 'supplier_resolved' ||
        (response.supplierId !== null && typeof response.supplierId !== 'string')) {
      throw new Error(messageFromFailure(response) ?? 'A extensão não resolveu o fornecedor.');
    }
    return { supplierId: response.supplierId };
  }
}

async function waitForHandshakeRetry(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;

  await new Promise<void>((resolve) => {
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, HANDSHAKE_RETRY_DELAY_MS);

    const onAbort = () => {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseReadyResponse(value: unknown): PortalExtensionInfo | null {
  if (!isRecord(value) || value.type !== 'ready' || typeof value.version !== 'string') return null;
  if (!isRecord(value.capabilities) ||
      value.capabilities.portalLookup !== true ||
      value.capabilities.supplierResolution !== true) {
    return null;
  }
  return {
    version: value.version,
    capabilities: {
      portalLookup: true,
      supplierResolution: true,
    },
  };
}

function isStartedResponse(value: unknown): value is { type: 'started'; operationId: string } {
  return isRecord(value) &&
    value.type === 'started' &&
    typeof value.operationId === 'string' &&
    value.operationId.length > 0;
}

function parseTerminalEvent(value: unknown, operationId: string): PortalOperationStatus | null {
  if (!isRecord(value) || value.operationId !== operationId) return null;

  if (value.type === 'completed' && typeof value.xml === 'string' && value.xml.length > 0) {
    return { operationId, state: 'completed', message: null, xml: value.xml };
  }
  if (value.type === 'failed') {
    return {
      operationId,
      state: 'failed',
      message: typeof value.message === 'string' ? value.message : 'A extensão não concluiu a consulta.',
      xml: null,
    };
  }
  if (value.type === 'cancelled') {
    return {
      operationId,
      state: 'cancelled',
      message: typeof value.message === 'string' ? value.message : 'Consulta pelo Portal cancelada.',
      xml: null,
    };
  }
  return null;
}

function messageFromFailure(value: unknown): string | null {
  return isRecord(value) && typeof value.message === 'string' ? value.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
