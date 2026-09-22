import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const KEY = '42260812345678000123550010000012341000012342';
const smokeUrl = new URL('../src/extension-only-smoke.ts', import.meta.url);
const pageUrl = new URL('../extension-test.html', import.meta.url);
const viteConfigUrl = new URL('../vite.config.ts', import.meta.url);
const xml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');

const info = {
  version: '0.2.9',
  capabilities: {
    directLookup: true,
    openOptions: true,
    portalLookup: true,
    supplierResolution: true,
  },
  configuration: { fiscalIdentityConfigured: true },
};

describe('extension-only physical gate page', () => {
  it('is structurally independent from the Bridge and is emitted by Vite', () => {
    expect(existsSync(smokeUrl)).toBe(true);
    expect(existsSync(pageUrl)).toBe(true);
    if (!existsSync(smokeUrl) || !existsSync(pageUrl)) return;

    const source = readFileSync(smokeUrl, 'utf8');
    const html = readFileSync(pageUrl, 'utf8');
    const viteConfig = readFileSync(viteConfigUrl, 'utf8');

    expect(source).not.toContain('BridgeClient');
    expect(source).not.toContain('127.0.0.1:17345');
    expect(source).toContain('extension.directLookup');
    expect(source).toContain("direct.cStat === '217'");
    expect(source).toContain("client.onReadyHint(refreshState)");
    expect(html).toContain('/src/extension-only-smoke.ts');
    expect(viteConfig).toContain('extension-test.html');
  });

  it('finishes from direct SEFAZ without opening Portal', async () => {
    const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
    const calls: string[] = [];
    const extension = {
      getInfo: async () => info,
      directLookup: async (accessKey: string) => {
        calls.push('direct:' + accessKey);
        return { category: 'success' as const, xml, cStat: '138', message: 'ok' };
      },
      start: async () => { calls.push('portal'); return 'op-1'; },
      waitForResult: async () => { throw new Error('Portal não deveria abrir'); },
      cancel: async () => {},
      resolveSupplier: async (taxId: string) => {
        calls.push('supplier:' + taxId);
        return { supplierId: 'fernando-klein' };
      },
    };

    const parsed = await runExtensionOnlySmoke(KEY, extension);
    expect(parsed.accessKey).toBe(KEY);
    expect(calls).toEqual(['direct:' + KEY, 'supplier:12345678000123']);
  });

  it('falls back to Portal only on 217', async () => {
    const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
    const calls: string[] = [];
    const extension = {
      getInfo: async () => info,
      directLookup: async () => ({ category: 'fiscal_status' as const, xml: null, cStat: '217', message: 'não consta' }),
      start: async () => { calls.push('start'); return 'op-1'; },
      waitForResult: async () => ({ operationId: 'op-1', state: 'completed' as const, message: null, xml }),
      cancel: async () => {},
      resolveSupplier: async () => ({ supplierId: null }),
    };

    await runExtensionOnlySmoke(KEY, extension);
    expect(calls).toEqual(['start']);
  });

  it('does not hide a direct transport error behind Portal', async () => {
    const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
    let starts = 0;
    const extension = {
      getInfo: async () => info,
      directLookup: async () => ({ category: 'transport_unavailable' as const, xml: null, cStat: null, message: 'falha direta' }),
      start: async () => { starts += 1; return 'never'; },
      waitForResult: async () => { throw new Error('not used'); },
      cancel: async () => {},
      resolveSupplier: async () => ({ supplierId: null }),
    };
    await expect(runExtensionOnlySmoke(KEY, extension)).rejects.toThrow('falha direta');
    expect(starts).toBe(0);
  });
});
