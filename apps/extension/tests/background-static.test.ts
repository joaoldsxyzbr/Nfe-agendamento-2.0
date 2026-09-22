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
    expect(source).toContain('withOperationMutation');
    expect(source).toContain('claimPortalDownload');
    expect(source).toContain("operation.state !== 'waiting_result'");
    expect(source).toContain('clearActiveOperationIfCurrent');
    expect(source).toContain('stateChangedAt');
    expect(source).toContain('reconcileActiveOperation');
    expect(source).toContain('getReconciledActiveOperation');
    expect(source).toContain('chrome.windows.get');
    expect(source).toContain('chrome.tabs.get');
    expect(source).toContain('chrome.tabs.onRemoved');
    expect(source).toContain('chrome.storage.local.setAccessLevel');
    expect(source).toContain('lookupNfeDirect');
    expect(source).toContain('checkFiscalUsage');
    expect(source).toContain('recordFiscalAttempt');
    expect(source).toContain('blockFiscalUsage');
    expect(source).toContain("command.type === 'open_options'");
    expect(source).toContain('chrome.runtime.openOptionsPage');
    expect(source).toContain("'TRUSTED_CONTEXTS'");
    expect(source).toContain('chrome.webRequest.onBeforeRequest');
    expect(source).toContain('fetchPortalXmlInPage');
    expect(source).toContain("world: 'MAIN'");
    expect(source).toContain("credentials: 'include'");
    expect(source).not.toContain('fetch(replay.url, replay.init)');
    expect(source).not.toContain('webRequestBlocking');
    expect(source).toContain("'portal_operation_active'");
    expect(source).toContain("'portal_navigation_failed'");
    expect(source).toContain("'portal_download_not_found'");
    expect(source).toContain("'portal_download_request_missing'");
    expect(source).toContain("'portal_session_lost'");
    expect(source).toContain("'portal_xml_invalid'");
    expect(source).toContain("'portal_download_http_error'");
  });

  it('never executes or fabricates captcha tokens', () => {
    expect(existsSync(portalContentUrl)).toBe(true);
    if (!existsSync(portalContentUrl)) return;
    const source = readFileSync(portalContentUrl, 'utf8');

    expect(source).not.toContain('hcaptcha.execute');
    expect(source).not.toContain('grecaptcha.execute');
    expect(source).toContain('READY_ATTEMPTS');
    expect(source).toContain('sendReadyWithRetry');
    expect(source).toContain('MutationObserver');
    expect(source).toContain('FALLBACK_TICK_MS');
    expect(source).toContain('RESULT_TIMEOUT_MS');
    expect(source).toContain('DOWNLOAD_TIMEOUT_MS');
    expect(source).toContain('response.stateChangedAt');
    expect(source).toContain('validTimestampOrNow');
    expect(source).toContain("'result_timeout'");
    expect(source).toContain("'download_timeout'");
    expect(source).not.toContain('window.setInterval(() => void tick(), 250)');
    expect(source).toContain('h-captcha-response');
    expect(source).toContain('isOfficialConsultUrl(location.href)');

    const downloadProbe = source.indexOf('const control = findDownloadControl()');
    const captchaGate = source.indexOf('isOfficialConsultUrl(location.href)');
    expect(downloadProbe).toBeGreaterThanOrEqual(0);
    expect(captchaGate).toBeGreaterThan(downloadProbe);
  });
});
