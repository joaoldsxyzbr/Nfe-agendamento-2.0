import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const KEY = '42260812345678000123550010000012341000012342';
const smokeUrl = new URL('../src/extension-only-smoke.js', import.meta.url);
const pageUrl = new URL('../extension-test.html', import.meta.url);
const buildScriptUrl = new URL('../../../scripts/build-ui-preview.mjs', import.meta.url);
const xml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');
const info = {
    version: '0.2.11',
    capabilities: {
        openOptions: true,
        portalLookup: true,
        supplierResolution: true,
    },
};
describe('extension-only physical gate page', () => {
    it('is structurally independent from the Bridge and direct SEFAZ', () => {
        expect(existsSync(smokeUrl)).toBe(true);
        expect(existsSync(pageUrl)).toBe(true);
        if (!existsSync(smokeUrl) || !existsSync(pageUrl))
            return;
        const source = readFileSync(smokeUrl, 'utf8');
        const html = readFileSync(pageUrl, 'utf8');
        const buildScript = readFileSync(buildScriptUrl, 'utf8');
        expect(source).not.toContain('BridgeClient');
        expect(source).not.toContain('127.0.0.1:17345');
        expect(source).not.toContain('directLookup');
        expect(source).toContain('extension.start(validation.value)');
        expect(source).toContain("client.onReadyHint(refreshState)");
        expect(html).toContain('/src/extension-only-smoke.js');
        expect(buildScript).toContain('extension-test.html');
    });
    it('opens Portal and validates the returned XML', async () => {
        const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
        const calls = [];
        const extension = {
            getInfo: async () => info,
            start: async (accessKey) => { calls.push('start:' + accessKey); return 'op-1'; },
            waitForResult: async () => ({ operationId: 'op-1', state: 'completed', message: null, xml }),
            cancel: async () => { },
            resolveSupplier: async (taxId) => {
                calls.push('supplier:' + taxId);
                return { supplierId: 'fernando-klein' };
            },
        };
        const parsed = await runExtensionOnlySmoke(KEY, extension);
        expect(parsed.accessKey).toBe(KEY);
        expect(calls).toEqual(['start:' + KEY, 'supplier:12345678000123']);
    });
    it('fails when Portal support is unavailable', async () => {
        const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
        const extension = {
            getInfo: async () => ({ version: '0.1.0', capabilities: { openOptions: false, portalLookup: false, supplierResolution: true } }),
            start: async () => 'never',
            waitForResult: async () => { throw new Error('not used'); },
            cancel: async () => { },
            resolveSupplier: async () => ({ supplierId: null }),
        };
        await expect(runExtensionOnlySmoke(KEY, extension)).rejects.toThrow('Portal Nacional');
    });
});
