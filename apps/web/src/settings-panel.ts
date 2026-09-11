import './settings-panel.css';

const WINDOWS_SETUP_URL = 'https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/v0.0.11/NFeAgendamentoBridge-Setup-v0.0.11.exe';

window.addEventListener('DOMContentLoaded', initializeSettingsPanel, { once: true });

function initializeSettingsPanel(): void {
  const appShell = document.querySelector<HTMLElement>('.app-shell');
  const topbar = document.querySelector<HTMLElement>('.topbar');
  const bridgeStatus = document.querySelector<HTMLElement>('#bridge-status');
  const certificateCard = document.querySelector<HTMLElement>('.certificate-card');

  if (!appShell || !topbar || !bridgeStatus || !certificateCard) {
    return;
  }

  const topbarActions = document.createElement('div');
  topbarActions.className = 'topbar-actions';
  bridgeStatus.replaceWith(topbarActions);
  topbarActions.append(bridgeStatus);

  const downloadTrigger = document.createElement('a');
  downloadTrigger.id = 'app-download';
  downloadTrigger.className = 'topbar-icon-action download-trigger';
  downloadTrigger.href = WINDOWS_SETUP_URL;
  downloadTrigger.setAttribute('aria-label', 'Baixar app para Windows');
  downloadTrigger.title = 'Baixar app para Windows';
  downloadTrigger.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>`;
  topbarActions.append(downloadTrigger);

  const settingsTrigger = document.createElement('button');
  settingsTrigger.id = 'settings-trigger';
  settingsTrigger.className = 'topbar-icon-action settings-trigger';
  settingsTrigger.type = 'button';
  settingsTrigger.setAttribute('aria-label', 'Abrir configurações');
  settingsTrigger.setAttribute('aria-expanded', 'false');
  settingsTrigger.setAttribute('aria-controls', 'settings-panel');
  settingsTrigger.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9.6 3.2h4.8l.6 2.1c.4.2.8.4 1.2.7l2.1-.6 2.4 4.1-1.5 1.5c0 .3.1.7.1 1s0 .7-.1 1l1.5 1.5-2.4 4.1-2.1-.6c-.4.3-.8.5-1.2.7l-.6 2.1H9.6L9 18.7c-.4-.2-.8-.4-1.2-.7l-2.1.6-2.4-4.1L4.8 13c0-.3-.1-.7-.1-1s0-.7.1-1L3.3 9.5l2.4-4.1 2.1.6c.4-.3.8-.5 1.2-.7l.6-2.1Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>`;
  topbarActions.append(settingsTrigger);

  const settingsPanel = document.createElement('aside');
  settingsPanel.id = 'settings-panel';
  settingsPanel.className = 'settings-panel';
  settingsPanel.hidden = true;
  settingsPanel.setAttribute('role', 'dialog');
  settingsPanel.setAttribute('aria-labelledby', 'settings-title');

  const settingsHeader = document.createElement('div');
  settingsHeader.className = 'settings-panel-header';

  const settingsHeading = document.createElement('div');
  const settingsEyebrow = document.createElement('p');
  settingsEyebrow.className = 'eyebrow';
  settingsEyebrow.textContent = 'Configurações';
  const settingsTitle = document.createElement('h2');
  settingsTitle.id = 'settings-title';
  settingsTitle.textContent = 'Configurações';
  settingsHeading.append(settingsEyebrow, settingsTitle);

  const settingsClose = document.createElement('button');
  settingsClose.id = 'settings-close';
  settingsClose.className = 'settings-close';
  settingsClose.type = 'button';
  settingsClose.setAttribute('aria-label', 'Fechar configurações');
  settingsClose.textContent = '×';

  settingsHeader.append(settingsHeading, settingsClose);

  const settingsIntro = document.createElement('p');
  settingsIntro.className = 'settings-intro';
  settingsIntro.textContent = 'Gerencie o certificado A1 e a integração local deste computador.';

  const settingsContent = document.createElement('div');
  settingsContent.className = 'settings-content';
  settingsContent.append(certificateCard);

  settingsPanel.append(settingsHeader, settingsIntro, settingsContent);
  appShell.append(settingsPanel);

  settingsTrigger.addEventListener('click', () => {
    if (settingsPanel.hidden) {
      openSettings();
    } else {
      closeSettings();
    }
  });

  settingsClose.addEventListener('click', () => closeSettings());

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !settingsPanel.hidden) closeSettings();
  });

  document.addEventListener('pointerdown', (event) => {
    if (settingsPanel.hidden || !(event.target instanceof Node)) return;
    if (settingsPanel.contains(event.target) || settingsTrigger.contains(event.target)) return;
    closeSettings(false);
  });

  function openSettings(): void {
    settingsPanel.hidden = false;
    settingsTrigger.setAttribute('aria-expanded', 'true');
    settingsClose.focus();
  }

  function closeSettings(restoreFocus = true): void {
    settingsPanel.hidden = true;
    settingsTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) settingsTrigger.focus();
  }
}
