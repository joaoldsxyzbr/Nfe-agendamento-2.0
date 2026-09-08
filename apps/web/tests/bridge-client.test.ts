import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_BASE_URL } from '../src/bridge/contracts';
import { BridgeClient } from '../src/bridge/client';

describe('BridgeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads health only from the fixed bridge endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        version: '2.0.0',
        status: 'ok',
        webView2Available: true,
        certificateSelected: false,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const health = await new BridgeClient().health();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BRIDGE_BASE_URL}/health`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
      }),
    );
    expect(health.status).toBe('ok');
    expect(health.version).toBe('2.0.0');
  });

  it('rejects malformed health payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(new BridgeClient().health()).rejects.toThrow('Resposta inválida do Bridge');
  });
});
