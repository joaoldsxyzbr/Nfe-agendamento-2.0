import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('settings panel', () => {
  it('moves certificate controls behind a gear button in the top-right area', () => {
    expect(main).toContain('id="settings-trigger"');
    expect(main).toContain('aria-label="Abrir configurações"');
    expect(main).toContain('id="settings-panel"');
    expect(main).toContain('id="settings-close"');

    const panelStart = main.indexOf('id="settings-panel"');
    const panelEnd = main.indexOf('</aside>', panelStart);
    const certificateCard = main.indexOf('class="certificate-card"');
    const lookupCard = main.indexOf('class="lookup-card"');

    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
    expect(certificateCard).toBeGreaterThan(panelStart);
    expect(certificateCard).toBeLessThan(panelEnd);
    expect(lookupCard).toBeLessThan(panelStart);
  });

  it('opens and closes the settings popup without changing certificate logic', () => {
    expect(main).toContain("settingsTrigger.addEventListener('click'");
    expect(main).toContain("settingsClose.addEventListener('click'");
    expect(main).toContain("if (event.key === 'Escape' && !settingsPanel.hidden) closeSettings();");
    expect(main).toContain("settingsTrigger.setAttribute('aria-expanded', 'true')");
    expect(main).toContain("settingsTrigger.setAttribute('aria-expanded', 'false')");
  });

  it('styles the gear trigger and floating settings panel in the existing dark theme', () => {
    expect(styles).toContain('.topbar-actions');
    expect(styles).toContain('.settings-trigger');
    expect(styles).toContain('.settings-panel');
    expect(styles).toContain('.settings-panel[hidden]');
  });
});
