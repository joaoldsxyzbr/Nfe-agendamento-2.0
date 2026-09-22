import { describe, expect, it } from 'vitest';

const KEY = '42260912345678000195550010000000011123456786';

describe('BrowserPortalExtensionClient', () => {
  it('handshakes and correlates a completed operation', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const listeners = new Set<(message: unknown) => void>();
    const transport = {
      request: async (message: { type: string }) => {
        if (message.type === 'ping') return {
          type: 'ready',
          requestId: 'ping',
          version: '0.1.0',
          capabilities: { directLookup: true, openOptions: false, portalLookup: true, supplierResolution: true },
      configuration: { fiscalIdentityConfigured: true },
        };
        if (message.type === 'start') return { type: 'started', requestId: 'start', operationId: 'ext-op-1' };
        if (message.type === 'status') return {
          type: 'operation_status',
          requestId: 'status',
          operationId: 'ext-op-1',
          active: true,
          state: 'waiting_user',
        };
        if (message.type === 'cancel') return { type: 'cancelled', requestId: 'cancel', operationId: 'ext-op-1' };
        throw new Error('unexpected');
      },
      subscribe: (listener: (message: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    const client = new BrowserPortalExtensionClient(transport as never);
    expect(await client.getInfo()).toEqual({
      version: '0.1.0',
      capabilities: { directLookup: true, openOptions: false, portalLookup: true, supplierResolution: true },
      configuration: { fiscalIdentityConfigured: true },
    });
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


  it('detects open_options support from 0.2.8 even when the old handshake lacks the flag', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string }) => {
        if (message.type !== 'ping') throw new Error('unexpected');
        return {
          type: 'ready',
          requestId: 'ping',
          version: '0.2.8',
          capabilities: { directLookup: true, portalLookup: true, supplierResolution: true },
          configuration: { fiscalIdentityConfigured: false },
        };
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.getInfo()).resolves.toMatchObject({
      version: '0.2.8',
      capabilities: { openOptions: true },
    });
  });

  it('keeps 0.2.7 marked as not supporting automatic options', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string }) => {
        if (message.type !== 'ping') throw new Error('unexpected');
        return {
          type: 'ready',
          requestId: 'ping',
          version: '0.2.7',
          capabilities: { directLookup: true, portalLookup: true, supplierResolution: true },
          configuration: { fiscalIdentityConfigured: false },
        };
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.getInfo()).resolves.toMatchObject({
      version: '0.2.7',
      capabilities: { openOptions: false },
    });
  });

  it('opens extension options through the command channel', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const commands: unknown[] = [];
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string }) => {
        commands.push(message);
        if (message.type === 'open_options') {
          return { type: 'options_opened', requestId: 'options' };
        }
        throw new Error('unexpected');
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.openOptions()).resolves.toBeUndefined();
    expect(commands[0]).toMatchObject({ type: 'open_options' });
  });

  it('runs direct lookup through the extension command channel', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string }) => {
        if (message.type !== 'direct_lookup') throw new Error('unexpected');
        return {
          type: 'direct_lookup_result',
          result: { category: 'fiscal_status', xml: null, cStat: '217', message: 'não consta' },
        };
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.directLookup(KEY)).resolves.toMatchObject({
      category: 'fiscal_status',
      cStat: '217',
    });
  });

  it('resolves supplier identity through the extension without exposing configuration', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const commands: unknown[] = [];
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string; taxId?: string }) => {
        commands.push(message);
        if (message.type === 'resolve_supplier') {
          return {
            type: 'supplier_resolved',
            requestId: 'supplier',
            supplierId: 'fernando-klein',
          };
        }
        throw new Error('unexpected');
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.resolveSupplier('12.345.678/0001-95')).resolves.toEqual({
      supplierId: 'fernando-klein',
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: 'resolve_supplier',
      taxId: '12.345.678/0001-95',
    });
  });

  it('retries the handshake when the content script is not ready yet', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    let attempts = 0;
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string }) => {
        attempts += 1;
        if (message.type !== 'ping') throw new Error('unexpected');
        if (attempts < 3) throw new Error('content script ainda não carregou');
        return {
          type: 'ready',
          requestId: 'ping',
          version: '0.2.1',
          capabilities: { directLookup: true, portalLookup: true, supplierResolution: true },
          configuration: { fiscalIdentityConfigured: true },
        };
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.getInfo()).resolves.toEqual({
      version: '0.2.1',
      capabilities: { directLookup: true, portalLookup: true, supplierResolution: true },
          configuration: { fiscalIdentityConfigured: true },
    });
    expect(attempts).toBe(3);
  });

  it('emits a ready hint when the content script announces itself', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    let emit: (value: unknown) => void = () => {};
    const client = new BrowserPortalExtensionClient({
      request: async () => { throw new Error('not used'); },
      subscribe: (next: (value: unknown) => void) => {
        emit = next;
        return () => { emit = () => {}; };
      },
    } as never);

    const versions: string[] = [];
    const unsubscribe = client.onReadyHint((version) => versions.push(version));
    emit({ type: 'bridge_ready', version: '0.2.3' });
    emit({ type: 'state', operationId: 'op', state: 'opening' });
    unsubscribe();

    expect(versions).toEqual(['0.2.3']);
  });

  it('retries start once so a lost response does not require opening a second popup', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    let starts = 0;
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string }) => {
        if (message.type !== 'start') throw new Error('unexpected');
        starts += 1;
        if (starts === 1) throw new Error('resposta perdida após iniciar');
        return { type: 'started', operationId: 'ext-op-recovered' };
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.start(KEY)).resolves.toBe('ext-op-recovered');
    expect(starts).toBe(2);
  });

  it('fails explicitly when an operation cannot be reconciled anymore', async () => {
    const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
    const client = new BrowserPortalExtensionClient({
      request: async (message: { type: string; operationId?: string }) => {
        if (message.type === 'status') {
          return {
            type: 'operation_status',
            operationId: message.operationId,
            active: false,
            state: null,
          };
        }
        throw new Error('unexpected');
      },
      subscribe: () => () => {},
    } as never);

    await expect(client.waitForResult('ext-op-missing')).rejects.toThrow(
      'A operação do Portal não está mais ativa',
    );
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
