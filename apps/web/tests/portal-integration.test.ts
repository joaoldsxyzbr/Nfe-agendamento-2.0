import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/batch/controller.ts', import.meta.url), 'utf8');
const single = readFileSync(new URL('../src/nfe/consultation-controller.ts', import.meta.url), 'utf8');

describe('Portal-only integration', () => {
  it('opens the Portal directly for single and batch queries', () => {
    expect(main).toContain('new BrowserPortalExtensionClient()');
    expect(main).not.toContain('BridgeClient');
    expect(single).not.toContain('directLookup');
    expect(single).toContain('deps.portal.start(accessKey)');
    expect(batch).not.toContain('directLookup');
    expect(batch).toContain('deps.portal.start(item.accessKey, signal)');
    expect(batch).not.toContain("route = 'portal'");
  });

  it('keeps captcha manual and cancellation explicit', () => {
    expect(single).toContain('Resolva o hCaptcha manualmente');
    expect(single).toContain("portalStatus.state === 'cancelled'");
    expect(batch).toContain('Resolva o hCaptcha na janela do Portal.');
    expect(main).toContain("window.addEventListener('pagehide'");
  });
});
