import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const backgroundUrl = new URL('../src/background.ts', import.meta.url);
const portalContentUrl = new URL('../src/portal-content.ts', import.meta.url);

describe('extension background contract', () => {
  it('uses browser popup, session storage and a host-scoped non-blocking webRequest', () => {
    expect(existsSync(backgroundUrl)).toBe(true);
    if (!existsSync(backgroundUrl)) return;
    const source = readFileSync(backgroundUrl, 'utf8');

    expect(source).toContain('chrome.windows.create');
    expect(source).toContain("type: 'popup'");
    expect(source).toContain('chrome.tabs.query({ windowId: portalWindowId })');
    expect(source).toContain('chrome.storage.session');
    expect(source).toContain('chrome.webRequest.onBeforeRequest');
    expect(source).not.toContain('webRequestBlocking');
  });

  it('never executes or fabricates captcha tokens', () => {
    expect(existsSync(portalContentUrl)).toBe(true);
    if (!existsSync(portalContentUrl)) return;
    const source = readFileSync(portalContentUrl, 'utf8');

    expect(source).not.toContain('hcaptcha.execute');
    expect(source).not.toContain('grecaptcha.execute');
    expect(source).toContain('h-captcha-response');
    expect(source).toContain('isOfficialConsultUrl(location.href)');

    const downloadProbe = source.indexOf('const control = findDownloadControl()');
    const captchaGate = source.indexOf('isOfficialConsultUrl(location.href)');
    expect(downloadProbe).toBeGreaterThanOrEqual(0);
    expect(captchaGate).toBeGreaterThan(downloadProbe);
  });
});
