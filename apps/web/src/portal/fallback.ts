import { BridgeClient } from '../bridge/client';
import type { PortalOperationStatus, PortalStartResult } from '../bridge/contracts';

interface PortalClient {
  startPortal(accessKey: string, signal?: AbortSignal): Promise<PortalStartResult>;
  getPortalStatus(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus>;
  cancelPortal(operationId: string): Promise<void>;
}

type Sleep = (milliseconds: number, signal?: AbortSignal) => Promise<void>;

const DEFAULT_POLL_MS = 250;

export class PortalFallbackController {
  constructor(
    private readonly client: PortalClient = new BridgeClient(),
    private readonly sleep: Sleep = abortableSleep,
    private readonly pollMs = DEFAULT_POLL_MS,
  ) {}

  async start(accessKey: string, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const result = await this.client.startPortal(accessKey, signal);
    return result.operationId;
  }

  async waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus> {
    while (true) {
      signal?.throwIfAborted();
      const status = await this.client.getPortalStatus(operationId, signal);
      signal?.throwIfAborted();

      if (status.state !== 'waiting_for_user') return status;
      await this.sleep(this.pollMs, signal);
    }
  }

  async cancel(operationId: string): Promise<void> {
    const normalized = operationId.trim();
    if (!normalized) return;
    await this.client.cancelPortal(normalized);
  }
}

function abortableSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);

    const onAbort = () => {
      globalThis.clearTimeout(timeout);
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };

    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
