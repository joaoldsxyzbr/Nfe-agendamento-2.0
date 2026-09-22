import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const KEY = '42260812345678000123550010000012341000012342';
const smokeUrl = new URL('../src/extension-only-smoke.ts', import.meta.url);
const pageUrl = new URL('../extension-test.html', import.meta.url);
const viteConfigUrl = new URL('../vite.config.ts', import.meta.url);
const xml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');

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
    expect(html).toContain('/src/extension-only-smoke.ts');
    expect(html).toContain('id="extension-smoke-key"');
    expect(html).toContain('id="extension-smoke-run"');
    expect(viteConfig).toContain('extension-test.html');
  });

  it('runs Portal -> XML parser -> local supplier resolution with no Bridge call', async () => {
    const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
    const calls: string[] = [];
    const extension = {
      getInfo: async () => {
        calls.push('info');
        return {
          version: '0.1.0',
          capabilities: { portalLookup: true as const, supplierResolution: true as const },
        };
      },
      start: async (accessKey: string) => {
        calls.push('start:' + accessKey);
        return 'op-1';
      },
      waitForResult: async (operationId: string) => {
        calls.push('wait:' + operationId);
        return { operationId, state: 'completed' as const, message: null, xml };
      },
      cancel: async () => {},
      resolveSupplier: async (taxId: string) => {
        calls.push('supplier:' + taxId);
        return { supplierId: 'fernando-klein' };
      },
    };

    const parsed = await runExtensionOnlySmoke(KEY, extension);

    expect(parsed.accessKey).toBe(KEY);
    expect(parsed.supplierRuleId).toBe('fernando-klein');
    expect(calls).toEqual([
      'info',
      'start:' + KEY,
      'wait:op-1',
      'supplier:12345678000195',
    ]);
  });

  it('fails before opening the Portal when the extension is unavailable', async () => {
    const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
    let starts = 0;
    const extension = {
      getInfo: async () => null,
      start: async () => { starts += 1; return 'never'; },
      waitForResult: async () => {
        throw new Error('must not wait');
      },
      cancel: async () => {},
      resolveSupplier: async () => ({ supplierId: null }),
    };

    await expect(runExtensionOnlySmoke(KEY, extension)).rejects.toThrow('Extensão não conectada');
    expect(starts).toBe(0);
  });

  it('surfaces cancellation without parsing a fake result', async () => {
    const { runExtensionOnlySmoke } = await import('../src/extension-only-smoke');
    const extension = {
      getInfo: async () => ({
        version: '0.1.0',
        capabilities: { portalLookup: true as const, supplierResolution: true as const },
      }),
      start: async () => 'op-cancel',
      waitForResult: async () => ({
        operationId: 'op-cancel',
        state: 'cancelled' as const,
        message: 'popup fechado',
        xml: null,
      }),
      cancel: async () => {},
      resolveSupplier: async () => ({ supplierId: null }),
    };

    await expect(runExtensionOnlySmoke(KEY, extension)).rejects.toThrow('popup fechado');
  });
});
