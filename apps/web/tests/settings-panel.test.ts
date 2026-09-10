import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const settingsModuleUrl = new URL('../src/settings-panel.ts', import.meta.url);
const settingsStylesUrl = new URL('../src/settings-panel.css', import.meta.url);
const versionProps = readFileSync(new URL('../../../Directory.Build.props', import.meta.url), 'utf8');
const appVersion = versionProps.match(/<Version>([^<]+)<\/Version>/)?.[1] ?? '';

function readIfExists(url: URL): string {
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
}

describe('settings panel', () => {
  it('loads a dedicated settings controller after the main app', () => {
    expect(index).toContain('<script type="module" src="/src/main.ts"></script>');
    expect(index).toContain('<script type="module" src="/src/settings-panel.ts"></script>');
    expect(index.indexOf('/src/settings-panel.ts')).toBeGreaterThan(index.indexOf('/src/main.ts'));
  });

  it('adds a square Windows app download shortcut beside the settings action', () => {
    const settings = readIfExists(settingsModuleUrl);
    const styles = readIfExists(settingsStylesUrl);

    expect(appVersion).not.toBe('');
    expect(settings).toContain("downloadTrigger.id = 'app-download'");
    expect(settings).toContain("downloadTrigger.setAttribute('aria-label', 'Baixar app para Windows')");
    expect(settings).toContain(
      `https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/v${appVersion}/NFeAgendamentoBridge-Setup-v${appVersion}.exe`,
    );
    expect(settings.indexOf('topbarActions.append(downloadTrigger)')).toBeLessThan(
      settings.indexOf('topbarActions.append(settingsTrigger)'),
    );
    expect(styles).toContain('.topbar-icon-action');
    expect(styles).toContain('.download-trigger');
    expect(styles).toContain('width: 42px');
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
