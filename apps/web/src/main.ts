import { createBatchController } from './batch/controller';
import { createStoredZip } from './batch/zip';
import { BridgeClient } from './bridge/client';
import { createCertificateController } from './bridge/certificate-controller';
import type { NfeLookupResult } from './bridge/contracts';
import { attachDanfeZoom, renderDanfe } from './danfe/render';
import { createDanfeViewer } from './danfe/viewer';
import { validateAccessKey } from './nfe/access-key';
import { createConsultationController } from './nfe/consultation-controller';
import { parseNfeXml, type ParsedNfe } from './nfe/xml';
import { PortalFallbackController } from './portal/fallback';
import './styles.css';
import './batch.css';
import './danfe/styles.css';

type ConsultationMode = 'single' | 'batch';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Elemento #app não encontrado.');
}

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-heading">
        <div class="brand-lockup">
          <img class="brand-mark" src="/brand-mark.png" alt="" aria-hidden="true" />
          <h1 class="brand-title"><span>NF-e</span><span>Agendamento</span></h1>
        </div>
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
      <div class="section-heading lookup-heading">
        <div>
          <p class="eyebrow">Consulta</p>
          <h2 id="lookup-title">Chave de acesso</h2>
        </div>
        <div class="lookup-heading-actions">
          <span class="key-hint">44 dígitos</span>
          <div class="consultation-mode" role="group" aria-label="Modo de consulta">
            <button id="mode-single" class="mode-button is-active" type="button" aria-pressed="true">Uma NF-e</button>
            <button id="mode-batch" class="mode-button" type="button" aria-pressed="false">Lote</button>
          </div>
        </div>
      </div>

      <div id="single-consultation-panel">
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
      </div>

      <div id="batch-consultation-panel" hidden>
        <form id="batch-form" novalidate>
          <label for="batch-keys">Chaves das NF-e</label>
          <textarea
            id="batch-keys"
            rows="6"
            autocomplete="off"
            spellcheck="false"
            placeholder="Cole as chaves, uma por linha"
            aria-describedby="batch-help batch-input-summary"
          ></textarea>
          <div class="batch-form-footer">
            <div>
              <p id="batch-input-summary" class="batch-summary" aria-live="polite">Nenhuma chave informada.</p>
              <p id="batch-help" class="help-text">As chaves válidas aparecem abaixo antes de iniciar. O lote processa uma NF-e por vez.</p>
            </div>
            <button id="batch-start" type="submit" disabled>Iniciar lote</button>
          </div>
        </form>

        <div class="batch-run-toolbar" id="batch-run-toolbar">
          <div class="batch-progress-copy" aria-live="polite">
            <strong id="batch-progress">0 de 0</strong>
            <span id="batch-route">Aguardando início</span>
          </div>
          <div class="batch-toolbar-actions">
            <button id="batch-cancel" class="secondary-button" type="button" hidden>Cancelar lote</button>
            <button id="batch-zip" class="secondary-button" type="button" disabled>Baixar XMLs (.zip)</button>
            <button id="batch-print" class="secondary-button" type="button" disabled>Imprimir DANFEs</button>
          </div>
        </div>

        <div id="batch-list" class="batch-list" aria-live="polite">
          <div class="empty-state batch-empty">
            <strong>Nenhuma chave no lote</strong>
            <span>Cole as chaves acima para montar a lista.</span>
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
const modeSingle = requireElement<HTMLButtonElement>('#mode-single');
const modeBatch = requireElement<HTMLButtonElement>('#mode-batch');
const singlePanel = requireElement<HTMLElement>('#single-consultation-panel');
const batchPanel = requireElement<HTMLElement>('#batch-consultation-panel');
const lookupForm = requireElement<HTMLFormElement>('#lookup-form');
const accessKeyInput = requireElement<HTMLInputElement>('#access-key');
const lookupSubmit = requireElement<HTMLButtonElement>('#lookup-submit');
const lookupReset = requireElement<HTMLButtonElement>('#lookup-reset');
const resultCard = requireElement<HTMLElement>('#result');
const batchForm = requireElement<HTMLFormElement>('#batch-form');
const batchKeysInput = requireElement<HTMLTextAreaElement>('#batch-keys');
const batchInputSummary = requireElement<HTMLElement>('#batch-input-summary');
const batchStart = requireElement<HTMLButtonElement>('#batch-start');
const batchProgress = requireElement<HTMLElement>('#batch-progress');
const batchRouteText = requireElement<HTMLElement>('#batch-route');
const batchCancel = requireElement<HTMLButtonElement>('#batch-cancel');
const batchZip = requireElement<HTMLButtonElement>('#batch-zip');
const batchPrint = requireElement<HTMLButtonElement>('#batch-print');
const batchList = requireElement<HTMLElement>('#batch-list');
const danfeViewer = requireElement<HTMLElement>('#danfe-viewer');
const danfeTitle = requireElement<HTMLElement>('#danfe-title');
const danfeContent = requireElement<HTMLElement>('#danfe-content');
const danfeClose = requireElement<HTMLButtonElement>('#danfe-close');
const danfePrint = requireElement<HTMLButtonElement>('#danfe-print');
let currentDownloadUrl: string | null = null;
let consultationMode: ConsultationMode = 'single';

const danfeViewerController = createDanfeViewer({
  elements: {
    viewer: danfeViewer,
    title: danfeTitle,
    content: danfeContent,
    closeButton: danfeClose,
    printButton: danfePrint,
  },
  render: renderDanfe,
  attachZoom: attachDanfeZoom,
  bodyClassList: document.body.classList,
  addDocumentKeydownListener: (listener) => document.addEventListener('keydown', listener),
  removeDocumentKeydownListener: (listener) => document.removeEventListener('keydown', listener),
  print: () => window.print(),
});

const certificateController = createCertificateController({
  bridge: bridgeClient,
  elements: {
    bridgeStatus,
    bridgeStatusText,
    select: certificateSelect,
    applyButton: certificateApply,
    certificateState,
    help: certificateHelp,
  },
});

const batchController = createBatchController({
  elements: {
    keysInput: batchKeysInput,
    inputSummary: batchInputSummary,
    startButton: batchStart,
    cancelButton: batchCancel,
    zipButton: batchZip,
    printButton: batchPrint,
    progress: batchProgress,
    routeText: batchRouteText,
    modeSingleButton: modeSingle,
    modeBatchButton: modeBatch,
    list: batchList,
  },
  bridge: bridgeClient,
  portal: portalFallback,
  parseXml: parseNfeXml,
  createZip: createStoredZip,
  downloadBlob,
  openDanfe: (parsed) => danfeViewerController.open(parsed),
  downloadXml,
  openDanfeDocuments: (documents, title) => danfeViewerController.openMany(documents, title),
  printWindow: () => danfeViewerController.print(),
  setCertificateControlsEnabled: (enabled) => certificateController.setControlsEnabled(enabled),
  hasSelectableCertificates: () => certificateController.hasSelectableCertificates(),
});

const consultationController = createConsultationController({
  getAccessKey: () => accessKeyInput.value,
  clearAccessKey: () => {
    accessKeyInput.value = '';
  },
  validateAccessKey,
  bridge: bridgeClient,
  portal: portalFallback,
  parseXml: parseNfeXml,
  renderState: renderLookupState,
  renderFailure: renderLookupFailure,
  renderSuccess: renderLookupSuccess,
  renderInvalidXml,
  setBusy: setLookupBusy,
  focusInput: () => accessKeyInput.focus(),
  resetView: renderInitialResult,
});

certificateApply.addEventListener('click', () => {
  void certificateController.applySelection();
});

modeSingle.addEventListener('click', () => setConsultationMode('single'));
modeBatch.addEventListener('click', () => setConsultationMode('batch'));

lookupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void consultationController.submit();
});

batchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void batchController.start();
});
batchKeysInput.addEventListener('input', () => batchController.syncDraft());
batchCancel.addEventListener('click', () => {
  void batchController.cancel();
});
batchZip.addEventListener('click', () => batchController.downloadZip());
batchPrint.addEventListener('click', () => batchController.printDanfes());

lookupReset.addEventListener('click', () => consultationController.reset());
window.addEventListener('pagehide', () => {
  danfeViewerController.dispose();
  batchController.dispose();
  void consultationController.cancelActivePortal();
});

void certificateController.refresh();
batchController.syncDraft();

function setConsultationMode(mode: ConsultationMode): void {
  if (batchController.isBusy() || mode === consultationMode) return;
  consultationMode = mode;
  const single = mode === 'single';
  singlePanel.hidden = !single;
  batchPanel.hidden = single;
  modeSingle.classList.toggle('is-active', single);
  modeBatch.classList.toggle('is-active', !single);
  modeSingle.setAttribute('aria-pressed', String(single));
  modeBatch.setAttribute('aria-pressed', String(!single));

  if (single) {
    accessKeyInput.focus();
  } else {
    batchController.syncDraft();
    batchKeysInput.focus();
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
      if (lookup.cStat === '653') {
        renderLookupState(
          'NF-e cancelada',
          'Esta nota fiscal foi cancelada na SEFAZ e, por isso, o XML não está disponível para download. Código SEFAZ: 653.',
        );
        break;
      }
      renderLookupState('Resultado fiscal', status);
      break;
    default:
      renderLookupState('Consulta não concluída', status);
  }
}

function renderLookupSuccess(parsed: ParsedNfe): void {
  resetResult();
  lookupReset.hidden = false;

  const card = document.createElement('div');
  card.className = 'lookup-success-card';

  const header = document.createElement('div');
  header.className = 'lookup-success-header';

  const titleGroup = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = `NF-e ${parsed.number || parsed.accessKey}`;

  const badge = document.createElement('span');
  badge.className = 'lookup-success-badge';
  badge.textContent = 'Autorizada';

  titleGroup.append(title);
  header.append(titleGroup, badge);

  const issuer = document.createElement('p');
  issuer.textContent = parsed.issuer.name || 'Emitente não informado';

  const metadata = document.createElement('p');
  metadata.className = 'help-text';
  metadata.textContent = `Série ${parsed.series || '-'} · Chave ${parsed.accessKey}`;

  const actions = document.createElement('div');
  actions.className = 'result-actions';

  const preview = document.createElement('button');
  preview.type = 'button';
  preview.className = 'action-danfe-preview';
  preview.innerHTML = `
    <span class="action-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </span>
    <span>Visualizar DANFE</span>
  `;
  preview.title = 'Abrir DANFE para visualização e impressão';
  preview.addEventListener('click', () => danfeViewerController.open(parsed));

  currentDownloadUrl = URL.createObjectURL(new Blob([parsed.originalXml], { type: 'application/xml;charset=utf-8' }));
  const download = document.createElement('a');
  download.className = 'download-action';
  download.href = currentDownloadUrl;
  download.download = `${parsed.accessKey}.xml`;
  download.innerHTML = `
    <span class="action-icon" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </span>
    <span>Baixar XML</span>
  `;
  download.title = `Baixar arquivo XML completo (${parsed.accessKey}.xml)`;

  actions.append(preview, download);
  card.append(header, issuer, metadata, actions);
  resultCard.append(card);
}

function downloadXml(parsed: ParsedNfe): void {
  const blob = new Blob([parsed.originalXml], { type: 'application/xml;charset=utf-8' });
  downloadBlob(blob, `${parsed.accessKey}.xml`);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderLookupState(titleText: string, messageText: string): void {
  resetResult();
  lookupReset.hidden = false;
  appendResultState(titleText, messageText);
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
  danfeViewerController.close();
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
  modeBatch.disabled = busy;
  lookupSubmit.textContent = busy ? 'Consultando…' : 'Consultar';
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento ${selector} não encontrado.`);
  return element;
}
