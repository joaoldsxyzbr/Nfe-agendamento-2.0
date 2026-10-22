import { describe, expect, it } from 'vitest';
const KEY = '42260912345678000195550010000000011123456786';
describe('BrowserPortalExtensionClient', () => {
    it('handshakes and correlates a completed operation', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const listeners = new Set();
        const transport = {
            request: async (message) => {
                if (message.type === 'ping')
                    return {
                        type: 'ready',
                        requestId: 'ping',
                        version: '0.2.11',
                        capabilities: {
                            openOptions: true,
                            portalLookup: true,
                            supplierResolution: true,
                        },
                    };
                if (message.type === 'start')
                    return { type: 'started', requestId: 'start', operationId: 'ext-op-1' };
                if (message.type === 'status')
                    return {
                        type: 'operation_status',
                        requestId: 'status',
                        operationId: 'ext-op-1',
                        active: true,
                        state: 'waiting_user',
                    };
                if (message.type === 'cancel')
                    return { type: 'cancelled', requestId: 'cancel', operationId: 'ext-op-1' };
                throw new Error('unexpected');
            },
            subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const client = new BrowserPortalExtensionClient(transport);
        expect(await client.getInfo()).toEqual({
            version: '0.2.11',
            capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
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
    it('preserves the stable failure code from extension events for safe diagnostics', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const subscribers = new Set();
        const client = new BrowserPortalExtensionClient({
            request: async (command) => {
                if (command.type !== 'status')
                    throw new Error('unexpected');
                return { type: 'operation_status', operationId: 'op-failed', active: true, state: 'waiting_user' };
            },
            subscribe: (listener) => {
                subscribers.add(listener);
                return () => { subscribers.delete(listener); };
            },
        });
        const resultPromise = client.waitForResult('op-failed');
        for (const listener of subscribers) {
            listener({
                type: 'failed', operationId: 'op-failed', code: 'portal_session_lost',
                message: 'Sessão expirada', xml: null,
            });
        }
        const result = await resultPromise;
        expect(result).toMatchObject({
            state: 'failed', code: 'portal_session_lost', message: 'Sessão expirada', xml: null,
        });
    });
    it('keeps open_options compatibility with 0.2.8+', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const client = new BrowserPortalExtensionClient({
            request: async (message) => {
                if (message.type !== 'ping')
                    throw new Error('unexpected');
                return {
                    type: 'ready',
                    requestId: 'ping',
                    version: '0.2.8',
                    capabilities: { portalLookup: true, supplierResolution: true },
                };
            },
            subscribe: () => () => { },
        });
        await expect(client.getInfo()).resolves.toMatchObject({
            version: '0.2.8',
            capabilities: { openOptions: true, portalLookup: true },
        });
    });
    it('opens extension options through the command channel', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const commands = [];
        const client = new BrowserPortalExtensionClient({
            request: async (message) => {
                commands.push(message);
                if (message.type === 'open_options')
                    return { type: 'options_opened', requestId: 'options' };
                throw new Error('unexpected');
            },
            subscribe: () => () => { },
        });
        await expect(client.openOptions()).resolves.toBeUndefined();
        expect(commands[0]).toMatchObject({ type: 'open_options' });
    });
    it('resolves supplier identity through the extension without exposing configuration', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const client = new BrowserPortalExtensionClient({
            request: async (message) => {
                if (message.type === 'resolve_supplier') {
                    return { type: 'supplier_resolved', requestId: 'supplier', supplierId: 'fernando-klein' };
                }
                throw new Error('unexpected');
            },
            subscribe: () => () => { },
        });
        await expect(client.resolveSupplier('12.345.678/0001-95')).resolves.toEqual({
            supplierId: 'fernando-klein',
        });
    });
    it('coalesces concurrent handshakes and reuses recent extension info', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        let pings = 0;
        const client = new BrowserPortalExtensionClient({
            request: async (message) => {
                if (message.type !== 'ping')
                    throw new Error('unexpected');
                pings += 1;
                return {
                    type: 'ready',
                    version: '0.2.12',
                    capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
                };
            },
            subscribe: () => () => { },
        });
        const [first, second] = await Promise.all([client.getInfo(), client.getInfo()]);
        expect(first?.version).toBe('0.2.12');
        expect(second?.version).toBe('0.2.12');
        await expect(client.getInfo()).resolves.toMatchObject({ version: '0.2.12' });
        expect(pings).toBe(1);
    });
    it('forces a fresh handshake when diagnostics are manually refreshed', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        let pings = 0;
        const client = new BrowserPortalExtensionClient({
            request: async (message) => {
                if (message.type !== 'ping')
                    throw new Error('unexpected');
                pings += 1;
                return {
                    type: 'ready',
                    version: '0.2.13',
                    capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
                };
            },
            subscribe: () => () => { },
        });
        await client.getInfo();
        await client.getInfo();
        expect(pings).toBe(1);
        await client.refreshInfo();
        expect(pings).toBe(2);
    });
    it('retries start once so a lost response does not require opening a second popup', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        let starts = 0;
        const client = new BrowserPortalExtensionClient({
            request: async (message) => {
                if (message.type !== 'start')
                    throw new Error('unexpected');
                starts += 1;
                if (starts === 1)
                    throw new Error('resposta perdida após iniciar');
                return { type: 'started', operationId: 'ext-op-recovered' };
            },
            subscribe: () => () => { },
        });
        await expect(client.start(KEY)).resolves.toBe('ext-op-recovered');
        expect(starts).toBe(2);
    });
    it('fails explicitly when an operation cannot be reconciled anymore', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const client = new BrowserPortalExtensionClient({
            request: async (message) => {
                if (message.type === 'status') {
                    return { type: 'operation_status', operationId: message.operationId, active: false, state: null };
                }
                throw new Error('unexpected');
            },
            subscribe: () => () => { },
        });
        await expect(client.waitForResult('ext-op-missing')).rejects.toThrow('A operação do Portal não está mais ativa');
    });
    it('reports cancellation without treating the operation as successful', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const subscribers = new Set();
        const client = new BrowserPortalExtensionClient({
            request: async (command) => ({
                type: 'operation_status',
                operationId: command.operationId,
                active: true,
                state: 'waiting_user',
            }),
            subscribe: (listener) => {
                subscribers.add(listener);
                return () => subscribers.delete(listener);
            },
        });
        const pending = client.waitForResult('op-cancelled');
        for (const listener of subscribers) {
            listener({ type: 'cancelled', operationId: 'op-cancelled' });
        }
        await expect(pending).resolves.toMatchObject({
            operationId: 'op-cancelled',
            state: 'cancelled',
            message: 'Consulta pelo Portal cancelada.',
            xml: null,
        });
    });

    it('ignores invalid bridge notifications and refreshes extension info after a valid ready event', async () => {
        const { BrowserPortalExtensionClient } = await import('../src/portal/extension-client');
        const listeners = new Set();
        let pings = 0;
        const versions = [];
        const client = new BrowserPortalExtensionClient({
            request: async (command) => {
                if (command.type !== 'ping') throw new Error('unexpected command');
                pings += 1;
                return {
                    type: 'ready',
                    version: '0.2.16',
                    capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
                };
            },
            subscribe: (listener) => {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        });
        await client.getInfo();
        await client.getInfo();
        expect(pings).toBe(1);
        const unsubscribe = client.onReadyHint((version) => versions.push(version));
        for (const listener of listeners) {
            listener({ type: 'bridge_ready', version: null });
            listener({ type: 'bridge_ready', version: '0.2.16' });
        }
        expect(versions).toEqual(['0.2.16']);
        await client.getInfo();
        expect(pings).toBe(2);
        unsubscribe();
    });

});
