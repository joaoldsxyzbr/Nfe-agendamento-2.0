import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const extensionUrl = new URL('../src/portal/extension-client.ts', import.meta.url);
const mainUrl = new URL('../src/main.ts', import.meta.url);
describe('web bootstrap', () => {
  it('requires the Chromium extension and has no Windows Bridge endpoint', () => {
    expect(existsSync(extensionUrl)).toBe(true);
    const source = `${readFileSync(extensionUrl, 'utf8')}\n${readFileSync(mainUrl, 'utf8')}`;
    expect(source).toContain('BrowserPortalExtensionClient');
    expect(source).not.toContain('127.0.0.1:17345');
    expect(source).not.toContain('BridgeClient');
  });
});
