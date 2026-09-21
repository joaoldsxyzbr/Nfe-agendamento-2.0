import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeClient } from '../src/bridge/client';

describe('Bridge health capabilities', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts legacy health without capabilities', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        version: '0.0.17',
        status: 'ok',
        webView2Available: true,
        certificateSelected: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const health = await new BridgeClient().health();

    expect(health.version).toBe('0.0.17');
    expect(health.capabilities).toBeUndefined();
  });

  it('accepts the additive capability contract', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        version: '0.0.18',
        status: 'ok',
        webView2Available: true,
        certificateSelected: true,
        capabilities: {
          directLookup: true,
          portalFallback: true,
          portalPrewarm: false,
          manualXmlImport: false,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const health = await new BridgeClient().health();

    expect(health.capabilities).toEqual({
      directLookup: true,
      portalFallback: true,
      portalPrewarm: false,
      manualXmlImport: false,
    });
  });

  it('rejects malformed capabilities instead of silently trusting them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        version: '0.0.18',
        status: 'ok',
        webView2Available: true,
        certificateSelected: true,
        capabilities: {
          directLookup: 'yes',
          portalFallback: true,
          portalPrewarm: false,
          manualXmlImport: false,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(new BridgeClient().health()).rejects.toThrow('Resposta inválida do Bridge');
  });
});
