import { describe, expect, it } from 'vitest';

const KEY = '42260912345678000195550010000000011123456786';

describe('BrowserPortalExtensionClient', () => {
  it('handshakes and correlates a completed operation', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const listeners = new Set<(message: unknown) => void>();
    const transport = {
      request: async (message: { type: string }) => {
        if (message.type === 'ping') return { type: 'ready', requestId: 'ping', version: '0.1.0' };
        if (message.type === 'start') return { type: 'started', requestId: 'start', operationId: 'ext-op-1' };
        if (message.type === 'cancel') return { type: 'cancelled', requestId: 'cancel', operationId: 'ext-op-1' };
        throw new Error('unexpected');
      },
      subscribe: (listener: (message: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    const client = new BrowserPortalExtensionClient(transport as never);
    expect(await client.isAvailable()).toBe(true);
    expect(await client.start(KEY)).toBe('ext-op-1');

    const waiting = client.waitForResult('ext-op-1');
    for (const listener of listeners) {
      listener({
        type: 'completed',
        operationId: 'ext-op-1',
        xml: `<nfeProc><NFe><infNFe Id="NFe${KEY}"/></NFe></nfeProc>`,
      });
    }

    const result = await waiting;
    expect(result.state).toBe('completed');
    expect(result.xml).toContain('nfeProc');
  });

  it('treats a missing extension as unavailable instead of throwing', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const client = new BrowserPortalExtensionClient({
      request: async () => { throw new Error('no bridge content script'); },
      subscribe: () => () => {},
    } as never);

    expect(await client.isAvailable()).toBe(false);
  });
});
