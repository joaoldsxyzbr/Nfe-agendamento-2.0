import type { PortalOperationStatus } from './contracts';

const PAGE_CHANNEL = 'nfe-agendamento:portal-extension';
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 1_200;
const HANDSHAKE_ATTEMPTS = 3;
const HANDSHAKE_RETRY_DELAY_MS = 200;
const START_ATTEMPTS = 2;
const OPERATION_STATUS_ATTEMPTS = 2;
const COMMAND_RETRY_DELAY_MS = 150;

type ExtensionCommand =
  | { type: 'ping'; requestId: string }
  | { type: 'open_options'; requestId: string }
  | { type: 'start'; requestId: string; accessKey: string }
  | { type: 'status'; requestId: string; operationId: string }
  | { type: 'cancel'; requestId: string; operationId: string }
  | { type: 'resolve_supplier'; requestId: string; taxId: string };

export type PortalExtensionInfo = Readonly<{
  version: string;
  capabilities: Readonly<{
    openOptions: boolean;
    portalLookup: boolean;
    supplierResolution: boolean;
  }>;
}>;

export interface PortalExtensionTransport {
  request(command: ExtensionCommand, signal?: AbortSignal, timeoutMs?: number): Promise<unknown>;
  subscribe(listener: (event: unknown) => void): () => void;
}

export class WindowPortalExtensionTransport implements PortalExtensionTransport {
  private readonly origin: string;

  constructor(
    private readonly windowRef: Window = window,
    private readonly timeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
  ) {
    this.origin = windowRef.location.origin;
  }

  request(
    command: ExtensionCommand,
    signal?: AbortSignal,
    timeoutMs = this.timeoutMs,
  ): Promise<unknown> {
    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(
        () => finish(() => reject(new Error('Extensão do NFe Agendamento não respondeu.'))),
        timeoutMs,
      );

      const onAbort = () => finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')));
      const onMessage = (event: MessageEvent) => {
        if (event.source !== this.windowRef || event.origin !== this.origin) return;
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
        this.origin,
      );
    });
  }

  subscribe(listener: (event: unknown) => void): () => void {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== this.windowRef || event.origin !== this.origin) return;
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
      if (attempt < HANDSHAKE_ATTEMPTS - 1) await waitForHandshakeRetry(signal);
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

  async openOptions(signal?: AbortSignal): Promise<void> {
    const requestId = globalThis.crypto.randomUUID();
    const response = await this.transport.request({ type: 'open_options', requestId }, signal);
    if (!isRecord(response) || response.type !== 'options_opened') {
      throw new Error(messageFromFailure(response) ?? 'A extensão não abriu a tela de configuração.');
    }
  }

  async start(accessKey: string, signal?: AbortSignal): Promise<string> {
    const normalizedAccessKey = accessKey.trim().toUpperCase();
    let lastTransportError: unknown = null;

    for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
      signal?.throwIfAborted();
      const requestId = globalThis.crypto.randomUUID();
      let response: unknown;
      try {
        response = await this.transport.request(
          { type: 'start', requestId, accessKey: normalizedAccessKey },
          signal,
        );
      } catch (error) {
        if (signal?.aborted) throw error;
        lastTransportError = error;
        if (attempt < START_ATTEMPTS - 1) {
          await waitForRetry(COMMAND_RETRY_DELAY_MS, signal);
          continue;
        }
        break;
      }

      if (!isStartedResponse(response)) {
        throw new Error(messageFromFailure(response) ?? 'A extensão não iniciou o Portal.');
      }
      return response.operationId;
    }

    throw lastTransportError instanceof Error
      ? lastTransportError
      : new Error('A extensão não iniciou o Portal.');
  }

  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus> {
    signal?.throwIfAborted();

    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      let settled = false;

      const onAbort = () => finish(() => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')));
      const finish = (complete: () => void) => {
        if (settled) return;
        settled = true;
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

      void this.isOperationActive(operationId, signal)
        .then((active) => {
          if (!active) {
            finish(() => reject(new Error(
              'A operação do Portal não está mais ativa. Feche qualquer popup antigo e tente novamente.',
            )));
          }
        })
        .catch((error) => {
          finish(() => reject(error instanceof Error
            ? error
            : new Error('Não foi possível reconciliar a operação do Portal.')));
        });
    });
  }

  private async isOperationActive(operationId: string, signal?: AbortSignal): Promise<boolean> {
    let lastTransportError: unknown = null;
    for (let attempt = 0; attempt < OPERATION_STATUS_ATTEMPTS; attempt += 1) {
      signal?.throwIfAborted();
      const requestId = globalThis.crypto.randomUUID();
      let response: unknown;
      try {
        response = await this.transport.request({ type: 'status', requestId, operationId }, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        lastTransportError = error;
        if (attempt < OPERATION_STATUS_ATTEMPTS - 1) {
          await waitForRetry(COMMAND_RETRY_DELAY_MS, signal);
          continue;
        }
        break;
      }

      const active = parseOperationStatus(response, operationId);
      if (active !== null) return active;
      throw new Error(messageFromFailure(response) ?? 'Resposta de estado da extensão inválida.');
    }

    throw lastTransportError instanceof Error
      ? lastTransportError
      : new Error('Não foi possível reconciliar a operação do Portal.');
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
  await waitForRetry(HANDSHAKE_RETRY_DELAY_MS, signal);
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => {
    const timeout = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
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
  if (!isRecord(value.capabilities)) return null;
  return {
    version: value.version,
    capabilities: {
      openOptions: value.capabilities.openOptions === true || versionAtLeast(value.version, 0, 2, 8),
      portalLookup: value.capabilities.portalLookup === true,
      supplierResolution: value.capabilities.supplierResolution === true,
    },
  };
}

function versionAtLeast(version: string, major: number, minor: number, patch: number): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return false;
  const current = [Number(match[1]), Number(match[2]), Number(match[3])];
  const expected = [major, minor, patch];
  for (let index = 0; index < expected.length; index += 1) {
    if (current[index] > expected[index]) return true;
    if (current[index] < expected[index]) return false;
  }
  return true;
}

function parseOperationStatus(value: unknown, operationId: string): boolean | null {
  if (!isRecord(value) ||
      value.type !== 'operation_status' ||
      value.operationId !== operationId ||
      typeof value.active !== 'boolean') {
    return null;
  }
  return value.active;
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
