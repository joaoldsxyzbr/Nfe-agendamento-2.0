import { BridgeClient } from './bridge/client';
import { classifyBridgeFailure } from './bridge/diagnostics';
import { checkWindowsUpdate } from './update/windows-update';
import './settings-panel.css';

const WINDOWS_SETUP_URL = '/downloads/windows/v0.0.21/NFeAgendamentoBridge-Setup-v0.0.21.exe';
const diagnosticsClient = new BridgeClient();

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
  downloadTrigger.setAttribute('aria-label', 'Baixar componente Windows');
  downloadTrigger.title = 'Baixar componente Windows';
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
  settingsIntro.textContent = 'Gerencie o certificado A1 e verifique a integração local deste computador.';

  const diagnosticsCard = document.createElement('section');
  diagnosticsCard.className = 'diagnostics-card';
  diagnosticsCard.setAttribute('aria-labelledby', 'diagnostics-title');
  diagnosticsCard.innerHTML = `
    <div class="diagnostics-heading">
      <div>
        <p class="eyebrow">Diagnóstico local</p>
        <h3 id="diagnostics-title">Estado do computador</h3>
      </div>
      <button id="diagnostics-refresh" type="button">Atualizar</button>
    </div>
    <dl class="diagnostics-grid">
      <div><dt>Bridge</dt><dd id="diagnostics-bridge">Ainda não verificado</dd></div>
      <div><dt>Versão</dt><dd id="diagnostics-version">—</dd></div>
      <div><dt>Certificado A1</dt><dd id="diagnostics-certificate">—</dd></div>
      <div><dt>Portal / WebView2</dt><dd id="diagnostics-webview">—</dd></div>
      <div><dt>Última verificação</dt><dd id="diagnostics-last-check">—</dd></div>
      <div class="diagnostics-error-row"><dt>Último erro</dt><dd id="diagnostics-last-error">Nenhum erro detectado nesta sessão.</dd></div>
    </dl>
    <a id="windows-update-action" class="windows-update-action" href="#" hidden>Atualização disponível</a>`;

  const diagnosticsRefresh = requireChild<HTMLButtonElement>(diagnosticsCard, '#diagnostics-refresh');
  const diagnosticsBridge = requireChild<HTMLElement>(diagnosticsCard, '#diagnostics-bridge');
  const diagnosticsVersion = requireChild<HTMLElement>(diagnosticsCard, '#diagnostics-version');
  const diagnosticsCertificate = requireChild<HTMLElement>(diagnosticsCard, '#diagnostics-certificate');
  const diagnosticsWebView = requireChild<HTMLElement>(diagnosticsCard, '#diagnostics-webview');
  const diagnosticsLastCheck = requireChild<HTMLElement>(diagnosticsCard, '#diagnostics-last-check');
  const diagnosticsLastError = requireChild<HTMLElement>(diagnosticsCard, '#diagnostics-last-error');
  const windowsUpdateAction = requireChild<HTMLAnchorElement>(diagnosticsCard, '#windows-update-action');

  const settingsContent = document.createElement('div');
  settingsContent.className = 'settings-content';
  settingsContent.append(diagnosticsCard, certificateCard);

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
  diagnosticsRefresh.addEventListener('click', () => void refreshDiagnostics());

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
    void refreshDiagnostics();
  }

  function closeSettings(restoreFocus = true): void {
    settingsPanel.hidden = true;
    settingsTrigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) settingsTrigger.focus();
  }

  async function refreshDiagnostics(): Promise<void> {
    diagnosticsRefresh.disabled = true;
    diagnosticsRefresh.textContent = 'Verificando…';
    diagnosticsBridge.textContent = 'Verificando…';
    windowsUpdateAction.hidden = true;
    windowsUpdateAction.removeAttribute('href');

    try {
      const health = await diagnosticsClient.health();
      diagnosticsBridge.textContent = 'Componente local conectado';
      diagnosticsVersion.textContent = health.version;
      diagnosticsCertificate.textContent = health.certificateSelected ? 'Selecionado' : 'Não selecionado';
      diagnosticsWebView.textContent = health.webView2Available ? 'Disponível' : 'Indisponível';
      diagnosticsLastError.textContent = 'Nenhum erro detectado nesta sessão.';
      diagnosticsLastCheck.textContent = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

      try {
        const update = await checkWindowsUpdate(health.version);
        if (update) {
          windowsUpdateAction.href = update.downloadUrl;
          windowsUpdateAction.textContent = `Atualizar componente Windows para ${update.latestVersion}`;
          windowsUpdateAction.hidden = false;
        }
      } catch {
        // A atualização é best-effort e não altera a saúde do Bridge local.
      }
    } catch (error) {
      const state = classifyBridgeFailure(error);
      diagnosticsBridge.textContent = bridgeDiagnosticLabel(state);
      diagnosticsVersion.textContent = '—';
      diagnosticsCertificate.textContent = '—';
      diagnosticsWebView.textContent = '—';
      diagnosticsLastCheck.textContent = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());
      diagnosticsLastError.textContent = diagnosticErrorMessage(error, state);
    } finally {
      diagnosticsRefresh.disabled = false;
      diagnosticsRefresh.textContent = 'Atualizar';
    }
  }
}

function requireChild<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento ${selector} não encontrado no painel de configurações.`);
  return element;
}

function bridgeDiagnosticLabel(
  state: ReturnType<typeof classifyBridgeFailure>,
): string {
  switch (state) {
    case 'local_access_unavailable':
      return 'Componente local inacessível';
    case 'incompatible':
      return 'Bridge incompatível';
    default:
      return 'Indisponível';
  }
}

function diagnosticErrorMessage(
  error: unknown,
  state: ReturnType<typeof classifyBridgeFailure>,
): string {
  if (state === 'local_access_unavailable') {
    return 'O componente pode estar parado ou a permissão de rede local do navegador pode estar bloqueada.';
  }

  if (state === 'incompatible') {
    return 'O Bridge respondeu, mas o contrato local não é compatível com esta versão do site.';
  }

  const raw = error instanceof Error ? error.message : 'Não foi possível acessar o Bridge local.';
  return raw.replace(/\b[A-Z0-9]{44}\b/gi, '[chave omitida]').slice(0, 240);
}
