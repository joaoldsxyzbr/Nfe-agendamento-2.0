import { describe, expect, it, vi } from 'vitest';
import { ExtensionPageTransport } from '../src/portal/extension-client.js';

describe('ExtensionPageTransport MV3', () => {
    it('sends commands from the internal UI with its own tab id', async () => {
        const sendMessage = vi.fn(async () => ({ type: 'ready', version: '0.3.0' }));
        const listeners = new Set();
        const api = {
            tabs: { getCurrent: vi.fn(async () => ({ id: 22 })) },
            runtime: {
                sendMessage,
                onMessage: {
                    addListener: (listener) => listeners.add(listener),
                    removeListener: (listener) => listeners.delete(listener),
                },
            },
        };
        const transport = new ExtensionPageTransport(api);
        const response = await transport.request({ type: 'ping', requestId: 't-1' });
        expect(response.type).toBe('ready');
        expect(sendMessage).toHaveBeenCalledWith({
            source: 'app',
            appTabId: 22,
            command: { type: 'ping', requestId: 't-1' },
        });
        const received = [];
        const unsubscribe = transport.subscribe((event) => received.push(event));
        for (const listener of listeners) {
            listener({ source: 'background', siteTabId: 33, event: { type: 'failed' } });
            listener({ source: 'background', siteTabId: 22, event: { type: 'completed', operationId: 'abc' } });
        }
        await Promise.resolve();
        await Promise.resolve();
        expect(received).toEqual([{ type: 'completed', operationId: 'abc' }]);
        unsubscribe();
        expect(listeners.size).toBe(0);
    });
    it('rejects a non-tab extension page rather than impersonating another tab', async () => {
        const api = {
            tabs: { getCurrent: async () => null },
            runtime: { sendMessage: vi.fn() },
        };
        const transport = new ExtensionPageTransport(api);
        await expect(transport.request({ type: 'ping', requestId: 't-2' }))
            .rejects.toThrow('precisa estar aberto em uma janela');
        expect(api.runtime.sendMessage).not.toHaveBeenCalled();
    });
});
