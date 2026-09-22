import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/batch/controller.ts', import.meta.url), 'utf8');
const single = readFileSync(new URL('../src/nfe/consultation-controller.ts', import.meta.url), 'utf8');
describe('direct SEFAZ + Portal fallback integration', () => {
  it('uses the extension for direct lookup before Portal', () => {
    expect(main).toContain('new BrowserPortalExtensionClient()');
    expect(main).not.toContain('BridgeClient'); expect(main).not.toContain('PortalFallbackController');
    expect(single).toContain('deps.portal.directLookup(validation.value)');
    expect(single).toContain("lookup.cStat === '217'");
    expect(single).toContain('deps.portal.start(accessKey)');
    expect(batch).toContain('deps.portal.directLookup(item.accessKey, signal)');
    expect(batch).toContain("lookup.cStat === '217'");
    expect(batch).toContain("route = 'portal'");
    expect(batch).toContain('deps.portal.start(item.accessKey, signal)');
  });
  it('keeps captcha manual and cancellation explicit', () => {
    expect(single).toContain('Resolva o hCaptcha manualmente'); expect(single).toContain("portalStatus.state === 'cancelled'");
    expect(batch).toContain('Resolva o hCaptcha na janela do Portal.'); expect(main).toContain("window.addEventListener('pagehide'");
  });
});
