import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const htmlUrl = new URL('../direct-lookup.html', import.meta.url);
const sourceUrl = new URL('../src/direct-lookup-page.ts', import.meta.url);
const backgroundUrl = new URL('../src/background.ts', import.meta.url);
const buildUrl = new URL('../scripts/build.mjs', import.meta.url);

describe('direct lookup certificate context', () => {
  it('runs the SEFAZ fetch in a visible extension page instead of the MV3 service worker', () => {
    expect(existsSync(htmlUrl)).toBe(true);
    expect(existsSync(sourceUrl)).toBe(true);

    const html = readFileSync(htmlUrl, 'utf8');
    const source = readFileSync(sourceUrl, 'utf8');
    const background = readFileSync(backgroundUrl, 'utf8');

    expect(html).toContain('Autenticando certificado A1');
    expect(html).toContain('direct-lookup-page.js');
    expect(source).toContain("import { lookupNfeDirect");
    expect(source).toContain("source: 'direct_lookup_page'");
    expect(source).toContain("type: 'claim'");
    expect(source).toContain("type: 'result'");
    expect(background).toContain("url: 'about:blank'");
    expect(background).toContain('chrome.runtime.getURL(');
    expect(background).toContain('runDirectLookupInPage');
    expect(background).not.toContain('accessKey=');
    expect(background).not.toContain('cnpj=');
  });

  it('includes the certificate-auth page in the extension build', () => {
    const build = readFileSync(buildUrl, 'utf8');
    expect(build).toContain("'direct-lookup-page.ts', 'direct-lookup-page.js'");
    expect(build).toContain("../direct-lookup.html");
    expect(build).toContain("direct-lookup.html");
  });
});
