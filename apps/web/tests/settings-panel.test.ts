import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const settingsModuleUrl = new URL('../src/settings-panel.ts', import.meta.url);
const settingsStylesUrl = new URL('../src/settings-panel.css', import.meta.url);

function readIfExists(url: URL): string {
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('settings panel', () => {
  it('loads a dedicated settings controller after the main app', () => {
    expect(index).toContain('<script type="module" src="/src/main.ts"></script>');
    expect(index).toContain('<script type="module" src="/src/settings-panel.ts"></script>');
    expect(index.indexOf('/src/settings-panel.ts')).toBeGreaterThan(index.indexOf('/src/main.ts'));
  });

  it('moves certificate controls behind a gear button in the top-right area', () => {
    const settings = readIfExists(settingsModuleUrl);
    expect(settings).toContain("document.querySelector<HTMLElement>('.certificate-card')");
    expect(settings).toContain("settingsContent.append(certificateCard)");
    expect(settings).toContain("settingsTrigger.id = 'settings-trigger'");
    expect(settings).toContain("settingsTrigger.setAttribute('aria-label', 'Abrir configurações')");
    expect(settings).toContain("settingsPanel.id = 'settings-panel'");
    expect(settings).toContain("settingsClose.id = 'settings-close'");
  });

  it('opens and closes the popup while preserving the existing certificate controls', () => {
    const settings = readIfExists(settingsModuleUrl);
    expect(settings).toContain("settingsTrigger.addEventListener('click'");
    expect(settings).toContain("settingsClose.addEventListener('click'");
    expect(settings).toContain("if (event.key === 'Escape' && !settingsPanel.hidden) closeSettings();");
    expect(settings).toContain("settingsTrigger.setAttribute('aria-expanded', 'true')");
    expect(settings).toContain("settingsTrigger.setAttribute('aria-expanded', 'false')");
  });

  it('styles the gear trigger and floating settings panel in the existing dark theme', () => {
    const styles = readIfExists(settingsStylesUrl);
    expect(styles).toContain('.topbar-actions');
    expect(styles).toContain('.settings-trigger');
    expect(styles).toContain('.settings-panel');
    expect(styles).toContain('.settings-panel[hidden]');
  });
});
