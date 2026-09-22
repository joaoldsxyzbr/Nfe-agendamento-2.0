import { BrowserPortalExtensionClient } from './portal/extension-client';
import './settings-panel.css';

const client = new BrowserPortalExtensionClient();
window.addEventListener('DOMContentLoaded', initializeSettingsPanel, { once: true });

function initializeSettingsPanel(): void {
  const topbarControls = document.querySelector<HTMLElement>('#topbar-controls');
  const integrationStatus = document.querySelector<HTMLElement>('#integration-status');
  const integrationStatusText = document.querySelector<HTMLElement>('#integration-status-text');
  if (!topbarControls || !integrationStatus || !integrationStatusText) return;
  const statusElement = integrationStatus;
  const statusTextElement = integrationStatusText;

  const actions = document.createElement('div');
  actions.className = 'topbar-actions';
  const downloadTrigger = document.createElement('a');
  downloadTrigger.id = 'app-download';
  downloadTrigger.className = 'topbar-icon-action download-trigger';
  downloadTrigger.href = 'https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/latest/download/NFeAgendamento-Extension.zip';
  downloadTrigger.setAttribute('aria-label', 'Baixar extensão');
  downloadTrigger.title = 'Baixar extensão';
  downloadTrigger.textContent = '↓';

  const trigger = document.createElement('button');
  trigger.id = 'settings-trigger';
  trigger.className = 'settings-trigger topbar-icon-action';
  trigger.type = 'button';
  trigger.setAttribute('aria-label', 'Abrir configurações');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = '⚙';

  const panel = document.createElement('section');
  panel.id = 'settings-panel';
  panel.className = 'settings-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Configurações da integração');

  const header = document.createElement('div');
  header.className = 'settings-panel-header';
  const title = document.createElement('strong');
  title.textContent = 'Integração do navegador';
  const close = document.createElement('button');
  close.id = 'settings-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Fechar configurações');
  close.textContent = '×';
  header.append(title, close);

  const diagnostics = document.createElement('div');
  diagnostics.className = 'diagnostics-card';
  const extensionState = diagnosticRow('Extensão', 'Verificando…');
  const versionState = diagnosticRow('Versão', '—');
  const directState = diagnosticRow('Consulta direta', 'Verificando…');
  const portalState = diagnosticRow('Portal fallback', 'Verificando…');
  diagnostics.append(extensionState.row, versionState.row, directState.row, portalState.row);

  const note = document.createElement('p');
  note.className = 'settings-help';
  note.textContent = 'A extensão consulta a SEFAZ primeiro. Configure uma vez o CNPJ do A1 nas opções da extensão; certificado e chave privada continuam sob controle do Chrome/Edge e do Windows.';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'settings-refresh';
  refresh.textContent = 'Verificar novamente';

  panel.append(header, diagnostics, note, refresh);
  actions.append(downloadTrigger, trigger);
  topbarControls.append(actions);
  document.body.append(panel);

  const open = () => { panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); void refreshDiagnostics(); };
  const closePanel = () => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); trigger.focus(); };
  trigger.addEventListener('click', () => panel.hidden ? open() : closePanel());
  close.addEventListener('click', closePanel);
  refresh.addEventListener('click', () => void refreshDiagnostics());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });

  const stopReadyHint = client.onReadyHint(() => void refreshDiagnostics());
  window.addEventListener('pagehide', stopReadyHint, { once: true });
  window.addEventListener('focus', () => void refreshDiagnostics());
  window.addEventListener('pageshow', () => void refreshDiagnostics());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshDiagnostics();
  });
  void refreshDiagnostics();

  async function refreshDiagnostics(): Promise<void> {
    refresh.disabled = true;
    const info = await client.getInfo();
    if (info) {
      statusElement.dataset.state = 'connected';
      statusTextElement.textContent = `Extensão conectada · v${info.version}`;
      extensionState.value.textContent = 'Conectada';
      versionState.value.textContent = info.version;
      directState.value.textContent = info.capabilities.directLookup
        ? (info.fiscalIdentityConfigured ? 'Pronta' : 'Configurar CNPJ')
        : 'Indisponível';
      portalState.value.textContent = info.capabilities.portalLookup ? 'Disponível' : 'Indisponível';
    } else {
      statusElement.dataset.state = 'disconnected';
      statusTextElement.textContent = 'Extensão não conectada';
      extensionState.value.textContent = 'Não conectada';
      versionState.value.textContent = '—';
      directState.value.textContent = 'Indisponível';
      portalState.value.textContent = 'Indisponível';
    }
    refresh.disabled = false;
  }
}

function diagnosticRow(labelText: string, valueText: string): { row: HTMLElement; value: HTMLElement } {
  const row = document.createElement('div');
  row.className = 'diagnostics-row';
  const label = document.createElement('span');
  label.textContent = labelText;
  const value = document.createElement('strong');
  value.textContent = valueText;
  row.append(label, value);
  return { row, value };
}
