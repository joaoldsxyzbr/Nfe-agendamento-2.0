import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const settings = readFileSync(new URL('../src/settings-panel.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/settings-panel.css', import.meta.url), 'utf8');
describe('settings panel extension-only', () => {
  it('diagnoses only the browser extension', () => {
    expect(settings).toContain('BrowserPortalExtensionClient');
    expect(settings).toContain("extensionState.value.textContent = 'Conectada'");
    expect(settings).not.toContain('BridgeClient'); expect(settings).not.toContain('WebView2'); expect(settings).not.toContain('Windows'); expect(settings).not.toContain('certificateSelected');
  });
  it('keeps the compact settings popup', () => {
    expect(settings).toContain("trigger.id = 'settings-trigger'"); expect(settings).toContain("panel.id = 'settings-panel'"); expect(settings).toContain("close.id = 'settings-close'");
    expect(styles).toContain('.settings-panel'); expect(styles).toContain('.diagnostics-card');
  });
});
