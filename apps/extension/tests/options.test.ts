import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const htmlUrl = new URL('../options.html', import.meta.url);
const sourceUrl = new URL('../src/options.ts', import.meta.url);
const buildUrl = new URL('../scripts/build.mjs', import.meta.url);

describe('extension supplier options', () => {
  it('ships a local options page with explicit JSON import and clear actions', () => {
    expect(existsSync(htmlUrl)).toBe(true);
    expect(existsSync(sourceUrl)).toBe(true);
    if (!existsSync(htmlUrl) || !existsSync(sourceUrl)) return;

    const html = readFileSync(htmlUrl, 'utf8');
    const source = readFileSync(sourceUrl, 'utf8');

    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".json,application/json"');
    expect(html).toContain('id="fiscal-cnpj"');
    expect(html).toContain('id="fiscal-cnpj-save"');
    expect(html).toContain('id="fiscal-cnpj-clear"');
    expect(html).toContain('id="supplier-config-file"');
    expect(html).toContain('id="supplier-config-clear"');
    expect(source).toContain('saveFiscalIdentity');
    expect(source).toContain('loadFiscalIdentity');
    expect(source).toContain('clearFiscalIdentity');
    expect(source).toContain('analyzeSupplierConfig');
    expect(source).toContain('saveSupplierConfig');
    expect(source).toContain('Nenhuma configuração anterior foi alterada');
    expect(source).toContain('clearSupplierConfig');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('postMessage');
    expect(source).not.toContain('XMLHttpRequest');
  });

  it('includes the options assets in the extension build', () => {
    const source = readFileSync(buildUrl, 'utf8');
    expect(source).toContain("'options.ts', 'options.js'");
    expect(source).toContain("../options.html");
    expect(source).toContain("options.html");
  });
});
