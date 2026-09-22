import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/batch/controller.ts', import.meta.url), 'utf8');
const single = readFileSync(new URL('../src/nfe/consultation-controller.ts', import.meta.url), 'utf8');
describe('Portal extension integration', () => {
  it('uses the extension as the only consultation route', () => {
    expect(main).toContain('new BrowserPortalExtensionClient()');
    expect(main).not.toContain('BridgeClient'); expect(main).not.toContain('PortalFallbackController');
    expect(single).toContain('deps.portal.start(validation.value)'); expect(single).not.toContain('lookupNfe');
    expect(batch).toContain('deps.portal.start(item.accessKey, signal)'); expect(batch).not.toContain('lookupNfe'); expect(batch).not.toContain('SEFAZ');
  });
  it('keeps captcha manual and cancellation explicit', () => {
    expect(single).toContain('Resolva o hCaptcha manualmente'); expect(single).toContain("portalStatus.state === 'cancelled'");
    expect(batch).toContain('Resolva o hCaptcha na janela do Portal.'); expect(main).toContain("window.addEventListener('pagehide'");
  });
});
