import { BRIDGE_BASE_URL, type BridgeHealth } from './contracts';

const DEFAULT_TIMEOUT_MS = 2_000;

export class BridgeClient {
  constructor(
    private readonly baseUrl = BRIDGE_BASE_URL,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async health(signal?: AbortSignal): Promise<BridgeHealth> {
    const timeoutController = new AbortController();
    const timeout = globalThis.setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
        signal: requestSignal,
      });

      if (!response.ok) {
        throw new Error(`Bridge indisponível (${response.status})`);
      }

      const payload: unknown = await response.json();
      if (!isBridgeHealth(payload)) {
        throw new Error('Resposta inválida do Bridge');
      }

      return payload;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

function isBridgeHealth(value: unknown): value is BridgeHealth {
  if (!value || typeof value !== 'object') return false;

  const health = value as Record<string, unknown>;
  return (
    typeof health.version === 'string' &&
    health.version.length > 0 &&
    health.status === 'ok' &&
    typeof health.webView2Available === 'boolean' &&
    typeof health.certificateSelected === 'boolean'
  );
}
