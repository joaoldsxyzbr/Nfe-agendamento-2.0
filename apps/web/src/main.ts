import { BridgeClient } from './bridge/client';
import type { CertificateCatalog, CertificateSummary, NfeLookupResult } from './bridge/contracts';
import { attachDanfeZoom, renderDanfe } from './danfe/render';
import { validateAccessKey } from './nfe/access-key';
import { parseNfeXml, type ParsedNfe } from './nfe/xml';
import { PortalFallbackController } from './portal/fallback';
import './styles.css';
import './danfe/styles.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Elemento #app não encontrado.');
}

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">NFe Agendamento 2.0</p>
        <h1>Consultar NF-e</h1>
        <p class="subtitle">Consulta direta usando o certificado A1 deste computador.</p>
      </div>
      <div class="bridge-pill" id="bridge-status" data-state="checking" role="status" aria-live="polite">
        <span class="bridge-dot" aria-hidden="true"></span>
        <span id="bridge-status-text">Verificando Bridge…</span>
      </div>
    </header>

    <section class="certificate-card" aria-labelledby="certificate-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Certificado local</p>
          <h2 id="certificate-title">Certificado A1</h2>
        </div>
        <span class="certificate-state" id="certificate-state">Aguardando Bridge</span>
      </div>

      <label for="certificate-select">Certificado deste computador</label>
      <div class="certificate-row">
        <select id="certificate-select" disabled>
          <option value="">Verificando certificados…</option>
        </select>
        <button id="certificate-apply" type="button" disabled>Usar certificado</button>
      </div>
      <p class="help-text" id="certificate-help" aria-live="polite">A chave privada permanece no Windows. O site recebe somente nome, emissor, validade e thumbprint.</p>
    </section>

    <section class="lookup-card" aria-labelledby="lookup-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Consulta</p>
          <h2 id="lookup-title">Chave de acesso</h2>
        </div>
        <span class="key-hint">44 dígitos</span>
      </div>

      <form id="lookup-form" novalidate>
        <label for="access-key">Chave da NF-e</label>
        <div class="lookup-row">
          <input
            id="access-key"
            name="accessKey"
            inputmode="numeric"
            autocomplete="off"
            maxlength="44"
            placeholder="Digite ou cole a chave de acesso"
            aria-describedby="lookup-help"
          />
          <button id="lookup-submit" type="submit">Consultar</button>
        </div>
        <p id="lookup-help" class="help-text">O processamento visual acontece neste site. O Bridge local acessa o certificado A1 e consulta a SEFAZ quando necessário.</p>
      </form>

      <div class="lookup-result-section">
        <div class="result-toolbar">
          <button id="lookup-reset" class="lookup-reset" type="button" hidden>Nova consulta</button>
        </div>
        <div class="lookup-result" id="result" aria-live="polite">
          <div class="empty-state">
            <strong>Nenhuma NF-e carregada</strong>
            <span>Informe uma chave para iniciar.</span>
          </div>
        </div>
      </div>
    </section>
  </div>

  <section class="danfe" id="danfe-viewer" role="dialog" aria-modal="true" aria-labelledby="danfe-title" hidden>
    <div class="danfe-modal">
      <div class="danfe-toolbar">
        <strong class="danfe-toolbar-title" id="danfe-title">Visualizar DANFE</strong>
        <span class="danfe-zoom-hint">Ctrl + scroll para zoom</span>
        <div class="danfe-toolbar-actions">
          <button id="danfe-close" type="button">Fechar</button>
          <button id="danfe-print" type="button">Imprimir / PDF</button>
        </div>
      </div>
      <div class="danfe-scroll">
        <div id="danfe-content"></div>
      </div>
    </div>
  </section>
`;

const bridgeClient = new BridgeClient();
const portalFallback = new PortalFallbackController();
const bridgeStatus = requireElement<HTMLElement>('#bridge-status');
const bridgeStatusText = requireElement<HTMLElement>('#bridge-status-text');
const certificateSelect = requireElement<HTMLSelectElement>('#certificate-select');
const certificateApply = requireElement<HTMLButtonElement>('#certificate-apply');
const certificateState = requireElement<HTMLElement>('#certificate-state');
const certificateHelp = requireElement<HTMLElement>('#certificate-help');
const lookupForm = requireElement<HTMLFormElement>('#lookup-form');
const accessKeyInput = requireElement<HTMLInputElement>('#access-key');
const lookupSubmit = requireElement<HTMLButtonElement>('#lookup-submit');
const lookupReset = requireElement<HTMLButtonElement>('#lookup-reset');
const resultCard = requireElement<HTMLElement>('#result');
const danfeViewer = requireElement<HTMLElement>('#danfe-viewer');
const danfeContent = requireElement<HTMLElement>('#danfe-content');
const danfeClose = requireElement<HTMLButtonElement>('#danfe-close');
const danfePrint = requireElement<HTMLButtonElement>('#danfe-print');
let currentDownloadUrl: string | null = null;
let detachDanfeZoom: (() => void) | null = null;
let activePortalOperationId: string | null = null;

certificateApply.addEventListener('click', () => {
  void applyCertificateSelection();
});

lookupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitLookup();
});

lookupReset.addEventListener('click', resetConsultation);
danfeClose.addEventListener('click', closeDanfe);
danfePrint.addEventListener('click', () => window.print());
danfeViewer.addEventListener('click', (event) => {
  if (event.target === danfeViewer) closeDanfe();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !danfeViewer.hidden) closeDanfe();
});
window.addEventListener('pagehide', () => {
  if (!activePortalOperationId) return;
  const operationId = activePortalOperationId;
  activePortalOperationId = null;
  void portalFallback.cancel(operationId).catch(() => {
    // Cancelamento no unload é best-effort; o Bridge também aplica retenção/limpeza terminal.
  });
});

void refreshBridgeAndCertificates();

async function refreshBridgeAndCertificates(): Promise<void> {
  setBridgeState('checking');
  setCertificateControlsEnabled(false);

  try {
    await bridgeClient.health();
    setBridgeState('connected');
    const catalog = await bridgeClient.listCertificates();
    renderCertificateCatalog(catalog);
  } catch (error) {
    renderUnavailableCertificates();
    setBridgeState(isLocalPermissionError(error) ? 'permission' : 'missing');
  }
}

async function applyCertificateSelection(): Promise<void> {
  const thumbprint = certificateSelect.value;
  if (!thumbprint) return;

  setCertificateControlsEnabled(false);
  certificateHelp.textContent = 'Salvando seleção neste computador…';

  try {
    await bridgeClient.selectCertificate(thumbprint);
    const catalog = await bridgeClient.listCertificates();
    renderCertificateCatalog(catalog);
    certificateHelp.textContent = 'Certificado selecionado. Apenas o thumbprint fica salvo localmente.';
  } catch (error) {
    certificateHelp.textContent = error instanceof Error
      ? `Não foi possível selecionar o certificado: ${error.message}`
      : 'Não foi possível selecionar o certificado.';
    setCertificateControlsEnabled(certificateSelect.options.length > 1);
  }
}

async function submitLookup(): Promise<void> {
  const validation = validateAccessKey(accessKeyInput.value);
  if (!validation.valid) {
    renderLookupState('Chave inválida', validation.error);
    accessKeyInput.focus();
    return;
  }

  setLookupBusy(true);
  renderLookupState('Consultando NF-e', 'Aguardando resposta da SEFAZ pelo Bridge local…');

  try {
    const lookup = await bridgeClient.lookupNfe(validation.value);
    if (lookup.category === 'success' && lookup.xml) {
      try {
        const parsed = parseNfeXml(lookup.xml, validation.value);
        renderLookupSuccess(parsed);
      } catch (error) {
        renderInvalidXml(error);
      }
      return;
    }

    if (lookup.category === 'consumption_limit') {
      await runPortalFallback(validation.value, lookup);
      return;
    }

    renderLookupFailure(lookup);
  } catch (error) {
    renderLookupState(
      'Consulta não concluída',
      error instanceof Error ? error.message : 'Não foi possível concluir a consulta da NF-e.',
    );
  } finally {
    setLookupBusy(false);
  }
}

async function runPortalFallback(accessKey: string, lookup: NfeLookupResult): Promise<void> {
  const sefazMessage = lookup.message ?? 'A SEFAZ informou limite de consumo para esta consulta.';
  const sefazStatus = lookup.cStat ? `Status SEFAZ ${lookup.cStat}. ${sefazMessage}` : sefazMessage;

  renderLookupState(
    'Abrindo consulta alternativa',
    `${sefazStatus} Abrindo o Portal Nacional da NF-e neste computador. Resolva o hCaptcha manualmente e solicite o XML.`,
  );

  const operationId = await portalFallback.start(accessKey);
  activePortalOperationId = operationId;
  renderLookupState(
    'Portal Nacional aberto',
    'Resolva o hCaptcha manualmente na janela do Portal e conclua a consulta. Esta página receberá o XML automaticamente.',
  );

  try {
    const portalStatus = await portalFallback.waitForResult(operationId);
    if (portalStatus.state === 'completed' && portalStatus.xml) {
      try {
        const parsed = parseNfeXml(portalStatus.xml, accessKey);
        renderLookupSuccess(parsed);
      } catch (error) {
        renderInvalidXml(error);
      }
      return;
    }

    if (portalStatus.state === 'cancelled') {
      renderLookupState(
        'Consulta pelo Portal cancelada',
        portalStatus.message ?? 'A janela do Portal foi fechada antes de concluir o download do XML.',
      );
      return;
    }

    if (portalStatus.state === 'failed') {
      renderLookupState(
        'Portal da NF-e indisponível',
        portalStatus.message ?? 'Não foi possível concluir a consulta pelo Portal Nacional da NF-e.',
      );
      return;
    }

    renderLookupState('Consulta pelo Portal não concluída', portalStatus.message ?? 'O Portal não retornou XML.');
  } finally {
    if (activePortalOperationId === operationId) {
      activePortalOperationId = null;
    }
  }
}

function renderInvalidXml(error: unknown): void {
  renderLookupState(
    'XML inválido',
    error instanceof Error ? error.message : 'O XML retornado não pôde ser validado para a chave consultada.',
  );
}

function renderLookupFailure(lookup: NfeLookupResult): void {
  const message = lookup.message ?? 'A SEFAZ não retornou XML para esta consulta.';
  const status = lookup.cStat ? `Status SEFAZ ${lookup.cStat}. ${message}` : message;

  switch (lookup.category) {
    case 'consumption_limit':
      renderLookupState('Limite de consultas atingido', status);
      break;
    case 'certificate_error':
      renderLookupState('Certificado A1 indisponível', status);
      break;
    case 'transport_unavailable':
      renderLookupState('SEFAZ indisponível', status);
      break;
    case 'fiscal_status':
      renderLookupState('Resultado fiscal', status);
      break;
    default:
      renderLookupState('Consulta não concluída', status);
  }
}

function renderLookupSuccess(parsed: ParsedNfe): void {
  resetResult();
  lookupReset.hidden = false;

  const title = document.createElement('h2');
  title.textContent = `NF-e ${parsed.number || parsed.accessKey}`;

  const issuer = document.createElement('p');
  issuer.textContent = parsed.issuer.name || 'Emitente não informado';

  const metadata = document.createElement('p');
  metadata.className = 'help-text';
  metadata.textContent = `Série ${parsed.series || '-'} · Chave ${parsed.accessKey}`;

  const actions = document.createElement('div');
  actions.className = 'result-actions';

  const preview = document.createElement('button');
  preview.type = 'button';
  preview.textContent = 'Visualizar DANFE';
  preview.addEventListener('click', () => openDanfe(parsed));

  currentDownloadUrl = URL.createObjectURL(new Blob([parsed.originalXml], { type: 'application/xml;charset=utf-8' }));
  const download = document.createElement('a');
  download.className = 'download-action';
  download.href = currentDownloadUrl;
  download.download = `${parsed.accessKey}.xml`;
  download.textContent = 'Baixar XML';

  actions.append(preview, download);
  resultCard.append(title, issuer, metadata, actions);
}

function openDanfe(parsed: ParsedNfe): void {
  detachDanfeZoom?.();
  danfeContent.replaceChildren(renderDanfe(parsed));
  danfeViewer.hidden = false;
  document.body.classList.add('danfe-open');
  detachDanfeZoom = attachDanfeZoom(danfeViewer);
  danfeClose.focus();
}

function closeDanfe(): void {
  if (danfeViewer.hidden) return;
  danfeViewer.hidden = true;
  document.body.classList.remove('danfe-open');
  detachDanfeZoom?.();
  detachDanfeZoom = null;
  danfeContent.replaceChildren();
}

function renderLookupState(titleText: string, messageText: string): void {
  resetResult();
  lookupReset.hidden = false;
  appendResultState(titleText, messageText);
}

function resetConsultation(): void {
  accessKeyInput.value = '';
  renderInitialResult();
  accessKeyInput.focus();
}

function renderInitialResult(): void {
  resetResult();
  lookupReset.hidden = true;
  appendResultState('Nenhuma NF-e carregada', 'Informe uma chave para iniciar.');
}

function appendResultState(titleText: string, messageText: string): void {
  const state = document.createElement('div');
  state.className = 'empty-state';
  const title = document.createElement('strong');
  title.textContent = titleText;
  const message = document.createElement('span');
  message.textContent = messageText;
  state.append(title, message);
  resultCard.append(state);
}

function resetResult(): void {
  closeDanfe();
  if (currentDownloadUrl) {
    URL.revokeObjectURL(currentDownloadUrl);
    currentDownloadUrl = null;
  }
  resultCard.replaceChildren();
}

function setLookupBusy(busy: boolean): void {
  lookupSubmit.disabled = busy;
  lookupReset.disabled = busy;
  accessKeyInput.disabled = busy;
  lookupSubmit.textContent = busy ? 'Consultando…' : 'Consultar';
}

function renderCertificateCatalog(catalog: CertificateCatalog): void {
  certificateSelect.replaceChildren();

  if (catalog.certificates.length === 0) {
    certificateSelect.append(createOption('', 'Nenhum certificado A1 utilizável encontrado'));
    certificateState.textContent = 'Nenhum A1 disponível';
    setCertificateControlsEnabled(false);
    return;
  }

  certificateSelect.append(createOption('', 'Selecione um certificado'));
  for (const certificate of catalog.certificates) {
    certificateSelect.append(createCertificateOption(certificate));
  }

  if (catalog.selectedThumbprint &&
      catalog.certificates.some((certificate) => certificate.thumbprint === catalog.selectedThumbprint)) {
    certificateSelect.value = catalog.selectedThumbprint;
    certificateState.textContent = 'Certificado selecionado';
  } else {
    certificateState.textContent = 'Seleção necessária';
  }

  setCertificateControlsEnabled(true);
}

function renderUnavailableCertificates(): void {
  certificateSelect.replaceChildren(createOption('', 'Bridge local indisponível'));
  certificateState.textContent = 'Indisponível';
  setCertificateControlsEnabled(false);
}

function createCertificateOption(certificate: CertificateSummary): HTMLOptionElement {
  const expiration = new Intl.DateTimeFormat('pt-BR').format(new Date(certificate.notAfter));
  return createOption(
    certificate.thumbprint,
    `${certificate.subject} · válido até ${expiration}`,
  );
}

function createOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function setCertificateControlsEnabled(enabled: boolean): void {
  certificateSelect.disabled = !enabled;
  certificateApply.disabled = !enabled || !certificateSelect.value;

  if (enabled) {
    certificateSelect.onchange = () => {
      certificateApply.disabled = !certificateSelect.value;
    };
  }
}

function setBridgeState(state: 'checking' | 'connected' | 'missing' | 'permission'): void {
  bridgeStatus.dataset.state = state;

  switch (state) {
    case 'connected':
      bridgeStatusText.textContent = 'Bridge conectado';
      break;
    case 'permission':
      bridgeStatusText.textContent = 'Permissão de acesso local necessária';
      certificateHelp.textContent = 'Autorize o navegador a acessar o serviço local e recarregue a página.';
      break;
    case 'missing':
      bridgeStatusText.textContent = 'Bridge não encontrado';
      certificateHelp.textContent = 'Instale ou inicie o Bridge neste computador para usar o certificado A1.';
      break;
    default:
      bridgeStatusText.textContent = 'Verificando Bridge…';
  }
}

function isLocalPermissionError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return true;
  }

  return error instanceof Error && /permission|private network|local network|acesso local/i.test(error.message);
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento ${selector} não encontrado.`);
  return element;
}
