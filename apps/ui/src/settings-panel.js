import { BrowserPortalExtensionClient } from './portal/extension-client.js';
import { assessExtensionCompatibility, hasRequiredExtensionCapabilities } from './portal/compatibility.js';

const client = new BrowserPortalExtensionClient();
window.addEventListener('DOMContentLoaded', initializeSettingsPanel, { once: true });
function initializeSettingsPanel() {
    const topbarControls = document.querySelector('#topbar-controls');
    const integrationStatus = document.querySelector('#integration-status');
    const integrationStatusText = document.querySelector('#integration-status-text');
    if (!topbarControls || !integrationStatus || !integrationStatusText)
        return;
    const statusElement = integrationStatus;
    const statusTextElement = integrationStatusText;
    const actions = document.createElement('div');
    actions.className = 'topbar-actions';
    const downloadTrigger = document.createElement('a');
    downloadTrigger.id = 'extension-releases';
    downloadTrigger.className = 'topbar-icon-action download-trigger';
    downloadTrigger.href = 'https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/latest';
    downloadTrigger.setAttribute('aria-label', 'Abrir releases da extensão no GitHub');
    downloadTrigger.title = 'Abrir releases da extensão no GitHub';
    downloadTrigger.target = '_blank';
    downloadTrigger.rel = 'noopener noreferrer';
    downloadTrigger.innerHTML = iconSvg('download');
    const trigger = document.createElement('button');
    trigger.id = 'settings-trigger';
    trigger.className = 'settings-trigger topbar-icon-action';
    trigger.type = 'button';
    trigger.setAttribute('aria-label', 'Abrir configurações');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = iconSvg('settings');
    const panel = document.createElement('dialog');
    panel.id = 'settings-panel';
    panel.className = 'settings-panel';
    panel.setAttribute('aria-labelledby', 'settings-title');
    const header = document.createElement('div');
    header.className = 'settings-panel-header';
    const title = document.createElement('strong');
    title.id = 'settings-title';
    title.textContent = 'Integração do navegador';
    const close = document.createElement('button');
    close.id = 'settings-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar configurações');
    close.innerHTML = iconSvg('close');
    header.append(title, close);
    const diagnostics = document.createElement('div');
    diagnostics.className = 'diagnostics-card';
    const integrationState = diagnosticRow('Integração', 'Verificando…');
    const extensionState = diagnosticRow('Extensão', 'Verificando…');
    const versionState = diagnosticRow('Versão', '—');
    const compatibilityState = diagnosticRow('Compatibilidade', 'Verificando…');
    const portalState = diagnosticRow('Portal Nacional', 'Verificando…');
    const supplierState = diagnosticRow('Regras de fornecedor', 'Verificando…');
    diagnostics.append(integrationState.row, extensionState.row, versionState.row, compatibilityState.row, portalState.row, supplierState.row);
    const note = document.createElement('p');
    note.className = 'settings-help';
    note.textContent =
        'Toda consulta usa o Portal Nacional. O hCaptcha continua manual. Clique no ícone da extensão para importar ou limpar regras locais de fornecedor.';
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'settings-refresh';
    refresh.textContent = 'Verificar novamente';
    panel.append(header, diagnostics, note, refresh);
    actions.append(downloadTrigger, trigger);
    topbarControls.append(actions);
    document.body.append(panel);
    const open = () => {
        if (panel.open)
            return;
        panel.showModal();
        document.body.classList.add('settings-open');
        trigger.setAttribute('aria-expanded', 'true');
        close.focus();
        void refreshDiagnostics();
    };
    const closePanel = () => {
        if (panel.open)
            panel.close();
    };
    trigger.addEventListener('click', () => panel.open ? closePanel() : open());
    close.addEventListener('click', closePanel);
    refresh.addEventListener('click', () => void refreshDiagnostics(true));
    panel.addEventListener('close', () => {
        document.body.classList.remove('settings-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
    });
    const stopReadyHint = client.onReadyHint(() => void refreshDiagnostics());
    window.addEventListener('pagehide', stopReadyHint, { once: true });
    window.addEventListener('focus', () => void refreshDiagnostics());
    window.addEventListener('pageshow', () => void refreshDiagnostics());
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
            void refreshDiagnostics();
    });
    void refreshDiagnostics();
    async function refreshDiagnostics(force = false) {
        refresh.disabled = true;
        const info = force ? await client.refreshInfo() : await client.getInfo();
        if (info) {
            const compatibility = assessExtensionCompatibility(info.version);
            const ready = hasRequiredExtensionCapabilities(info.capabilities);
            statusElement.dataset.state = ready ? 'connected' : 'partial';
            statusTextElement.textContent = ready
                ? `Extensão conectada · v${info.version}`
                : `Extensão conectada · v${info.version} · integração parcial`;
            integrationState.value.textContent = ready ? 'Pronta' : 'Parcial';
            compatibilityState.value.textContent = compatibility === 'outdated' ? 'Atualização recomendada' : compatibility === 'unknown' ? 'Não verificada' : 'Versão reconhecida';
            extensionState.value.textContent = 'Conectada';
            versionState.value.textContent = info.version;
            portalState.value.textContent = info.capabilities.portalLookup ? 'Disponível' : 'Indisponível';
            supplierState.value.textContent = info.capabilities.supplierResolution ? 'Disponíveis' : 'Indisponíveis';
        }
        else {
            statusElement.dataset.state = 'disconnected';
            statusTextElement.textContent = 'Extensão não conectada';
            integrationState.value.textContent = 'Indisponível';
            extensionState.value.textContent = 'Não conectada';
            versionState.value.textContent = '—';
            compatibilityState.value.textContent = 'Não verificada';
            portalState.value.textContent = 'Indisponível';
            supplierState.value.textContent = 'Indisponíveis';
        }
        refresh.disabled = false;
    }
}
function diagnosticRow(labelText, valueText) {
    const row = document.createElement('div');
    row.className = 'diagnostics-row';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    value.textContent = valueText;
    row.append(label, value);
    return { row, value };
}
function iconSvg(icon) {
    const paths = {
        download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
        settings: '<path d="M4 7h10"/><circle cx="17" cy="7" r="2"/><path d="M20 17H10"/><circle cx="7" cy="17" r="2"/>',
        close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[icon]}</svg>`;
}
