import { MAX_BATCH_ITEMS, parseBatchInput } from './batch/input';
import { createStoredZip } from './batch/zip';
import { BridgeClient } from './bridge/client';
import type { CertificateCatalog, CertificateSummary, NfeLookupResult } from './bridge/contracts';
import { attachDanfeZoom, renderDanfe } from './danfe/render';
import { validateAccessKey } from './nfe/access-key';
import { parseNfeXml, type ParsedNfe } from './nfe/xml';
import { PortalFallbackController } from './portal/fallback';
import './styles.css';
import './batch.css';
import './danfe/styles.css';

type ConsultationMode = 'single' | 'batch';
type BatchRoute = 'sefaz' | 'portal';
type BatchItemStatus =
  | 'queued'
  | 'consulting'
  | 'portal_queued'
  | 'portal_waiting_user'
  | 'success'
  | 'fiscal_status'
  | 'transport_error'
  | 'portal_error'
  | 'cancelled';
type BatchSource = 'SEFAZ' | 'Portal';

type BatchItem = {
  accessKey: string;
  status: BatchItemStatus;
  message: string | null;
  parsed: ParsedNfe | null;
  source: BatchSource | null;
};

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
            placeholder="Cole até 10 chaves, uma por linha"
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
let detachDanfeZoom: (() => void) | null = null;
let activePortalOperationId: string | null = null;
let consultationMode: ConsultationMode = 'single';
let batchItems: BatchItem[] = [];
let batchRunning = false;
let batchManualPortalBusy = false;
let batchCancelled = false;
let batchRoute: BatchRoute = 'sefaz';
let batchAbortController: AbortController | null = null;

certificateApply.addEventListener('click', () => {
  void applyCertificateSelection();
});

modeSingle.addEventListener('click', () => setConsultationMode('single'));
modeBatch.addEventListener('click', () => setConsultationMode('batch'));

lookupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitLookup();
});

batchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void startBatch();
});
batchKeysInput.addEventListener('input', syncBatchDraft);
batchCancel.addEventListener('click', () => {
  void cancelBatch();
});
batchZip.addEventListener('click', downloadBatchZip);
batchPrint.addEventListener('click', printBatchDanfes);

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
  batchAbortController?.abort();
  if (!activePortalOperationId) return;
  const operationId = activePortalOperationId;
  activePortalOperationId = null;
  void portalFallback.cancel(operationId).catch(() => {
    // Cancelamento no unload é best-effort; o Bridge também aplica retenção/limpeza terminal.
  });
});

void refreshBridgeAndCertificates();
syncBatchDraft();

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

    if (
      lookup.category === 'consumption_limit'
      || (lookup.category === 'fiscal_status' && lookup.cStat === '217')
    ) {
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
  const sefazMessage = lookup.message ?? 'A consulta direta da SEFAZ não retornou o XML e será tentada pelo Portal Nacional.';
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

function setConsultationMode(mode: ConsultationMode): void {
  if (batchRunning || batchManualPortalBusy || mode === consultationMode) return;
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
    syncBatchDraft();
    batchKeysInput.focus();
  }
}

function syncBatchDraft(): void {
  if (batchRunning || batchManualPortalBusy) return;
  const summary = parseBatchInput(batchKeysInput.value);
  const parts = [
    `${summary.validKeys.length} válida${summary.validKeys.length === 1 ? '' : 's'}`,
    `${summary.invalidCount} inválida${summary.invalidCount === 1 ? '' : 's'}`,
    `${summary.duplicateCount} duplicada${summary.duplicateCount === 1 ? '' : 's'}`,
  ];
  batchInputSummary.textContent = summary.totalCandidates === 0
    ? 'Nenhuma chave informada.'
    : parts.join(' · ');

  if (summary.exceedsLimit) {
    batchInputSummary.textContent += ` · máximo ${MAX_BATCH_ITEMS} por lote`;
  }

  batchStart.disabled = summary.validKeys.length === 0 || summary.exceedsLimit;
  batchItems = summary.validKeys.map((accessKey) => createBatchItem(accessKey));
  batchRoute = 'sefaz';
  renderBatchState('Aguardando início');
}

async function startBatch(): Promise<void> {
  if (batchRunning || batchManualPortalBusy) return;
  const summary = parseBatchInput(batchKeysInput.value);
  if (summary.validKeys.length === 0 || summary.exceedsLimit) {
    syncBatchDraft();
    return;
  }

  batchItems = summary.validKeys.map((accessKey) => createBatchItem(accessKey));
  batchRunning = true;
  batchCancelled = false;
  batchRoute = 'sefaz';
  batchAbortController = new AbortController();
  setBatchControlsRunning(true);
  renderBatchState('Preparando lote');

  try {
    const health = await bridgeClient.health(batchAbortController.signal);
    if (!health.certificateSelected) {
      throw new Error('Selecione um certificado A1 antes de iniciar o lote.');
    }

    for (let index = 0; index < batchItems.length; index += 1) {
      if (batchCancelled) break;
      const item = batchItems[index];
      if (!item || item.status !== 'queued') continue;

      if (isBatchPortalRoute()) {
        item.status = 'portal_queued';
        item.message = 'SEFAZ em proteção; aguardando consulta pelo Portal.';
        renderBatchState('Lote seguindo pelo Portal');
        await processBatchPortalItem(item, batchAbortController.signal);
      } else {
        await processBatchDirectItem(item, batchAbortController.signal);
      }
    }
  } catch (error) {
    if (!isAbortError(error)) {
      markQueuedBatchItems('cancelled', null);
      batchRouteText.textContent = error instanceof Error ? error.message : 'Não foi possível iniciar o lote.';
    }
  } finally {
    if (batchCancelled) markQueuedBatchItems('cancelled', 'Não processada porque o lote foi cancelado.');
    batchRunning = false;
    batchAbortController = null;
    setBatchControlsRunning(false);
    renderBatchState(batchCancelled ? 'Lote cancelado' : 'Lote concluído');
  }
}

async function processBatchDirectItem(item: BatchItem, signal: AbortSignal): Promise<void> {
  item.status = 'consulting';
  item.message = 'Consultando SEFAZ…';
  renderBatchState('Consultando SEFAZ');

  try {
    const lookup = await bridgeClient.lookupNfe(item.accessKey, signal);
    if (lookup.category === 'success' && lookup.xml) {
      completeBatchItem(item, lookup.xml, 'SEFAZ');
      return;
    }

    if (lookup.category === 'consumption_limit') {
      batchRoute = 'portal';
      item.status = 'portal_queued';
      item.message = lookup.message ?? 'Limite da SEFAZ atingido. Continuando pelo Portal.';
      renderBatchState('SEFAZ em proteção · seguindo pelo Portal');
      await processBatchPortalItem(item, signal);
      return;
    }

    if (lookup.category === 'fiscal_status' && lookup.cStat === '217') {
      item.status = 'portal_queued';
      item.message = 'NF-e não localizada na consulta direta. Tentando pelo Portal.';
      renderBatchState('Fallback pelo Portal');
      await processBatchPortalItem(item, signal);
      return;
    }

    if (lookup.category === 'certificate_error') {
      item.status = 'transport_error';
      item.message = lookup.message ?? 'Certificado A1 indisponível.';
      batchCancelled = true;
      return;
    }

    item.status = lookup.category === 'fiscal_status' ? 'fiscal_status' : 'transport_error';
    item.message = lookup.cStat
      ? `Status SEFAZ ${lookup.cStat}. ${lookup.message ?? 'Sem XML disponível.'}`
      : lookup.message ?? 'Consulta não concluída.';
  } catch (error) {
    if (isAbortError(error) && batchCancelled) {
      item.status = 'cancelled';
      item.message = 'Consulta cancelada pelo usuário.';
      return;
    }
    throw error;
  } finally {
    renderBatchState(batchRoute === 'portal' ? 'Lote seguindo pelo Portal' : 'Consultando SEFAZ');
  }
}

async function processBatchPortalItem(item: BatchItem, signal?: AbortSignal): Promise<void> {
  item.status = 'portal_queued';
  item.message = 'Abrindo Portal Nacional…';
  renderBatchState('Abrindo Portal Nacional');

  try {
    const operationId = await portalFallback.start(item.accessKey, signal);
    activePortalOperationId = operationId;
    item.status = 'portal_waiting_user';
    item.message = 'Resolva o hCaptcha na janela do Portal.';
    renderBatchState('Resolva o hCaptcha');

    const portalStatus = await portalFallback.waitForResult(operationId, signal);
    if (portalStatus.state === 'completed' && portalStatus.xml) {
      completeBatchItem(item, portalStatus.xml, 'Portal');
      return;
    }

    if (portalStatus.state === 'cancelled') {
      item.status = batchCancelled ? 'cancelled' : 'portal_error';
      item.message = portalStatus.message ?? 'Consulta pelo Portal cancelada.';
      return;
    }

    item.status = 'portal_error';
    item.message = portalStatus.message ?? 'O Portal não retornou o XML desta NF-e.';
  } catch (error) {
    if (isAbortError(error) && batchCancelled) {
      item.status = 'cancelled';
      item.message = 'Consulta pelo Portal cancelada pelo usuário.';
      return;
    }

    item.status = 'portal_error';
    item.message = error instanceof Error ? error.message : 'Não foi possível concluir a consulta pelo Portal.';
  } finally {
    activePortalOperationId = null;
    renderBatchState(batchRoute === 'portal' ? 'Lote seguindo pelo Portal' : 'Consultando lote');
  }
}

function completeBatchItem(item: BatchItem, xml: string, source: BatchSource): void {
  try {
    item.parsed = parseNfeXml(xml, item.accessKey);
    item.source = source;
    item.status = 'success';
    item.message = `XML validado via ${source}.`;
  } catch (error) {
    item.status = source === 'Portal' ? 'portal_error' : 'transport_error';
    item.message = error instanceof Error ? error.message : 'O XML retornado não pôde ser validado.';
  }
}

async function cancelBatch(): Promise<void> {
  if (!batchRunning) return;
  batchCancelled = true;
  batchAbortController?.abort();
  const operationId = activePortalOperationId;
  if (operationId) {
    try {
      await portalFallback.cancel(operationId);
    } catch {
      // A interrupção local já impede o próximo item; o cancelamento remoto é best-effort.
    }
  }
}

async function retryBatchPortal(index: number): Promise<void> {
  const item = batchItems[index];
  if (!item || item.status !== 'portal_error' || batchRunning || batchManualPortalBusy) return;

  batchManualPortalBusy = true;
  setBatchControlsLocked(true);
  try {
    await processBatchPortalItem(item);
  } finally {
    batchManualPortalBusy = false;
    setBatchControlsLocked(false);
    renderBatchState('Reconsulta pelo Portal concluída');
  }
}

function renderBatchState(routeLabel: string): void {
  const terminal = batchItems.filter((item) => isTerminalBatchStatus(item.status)).length;
  const completed = completedBatchItems();
  batchProgress.textContent = `${terminal} de ${batchItems.length}`;
  batchRouteText.textContent = batchRunning
    ? `${routeLabel} · rota ${batchRoute === 'portal' ? 'Portal' : 'SEFAZ'}`
    : routeLabel;
  batchZip.disabled = completed.length === 0 || batchRunning || batchManualPortalBusy;
  batchPrint.disabled = completed.length === 0 || batchRunning || batchManualPortalBusy;
  renderBatchRows();
}

function renderBatchRows(): void {
  batchList.replaceChildren();
  if (batchItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state batch-empty';
    const title = document.createElement('strong');
    title.textContent = 'Nenhuma chave no lote';
    const message = document.createElement('span');
    message.textContent = 'Cole as chaves acima para montar a lista.';
    empty.append(title, message);
    batchList.append(empty);
    return;
  }

  batchItems.forEach((item, index) => {
    const row = document.createElement('article');
    row.className = 'batch-item';
    row.dataset.state = item.status;

    const order = document.createElement('span');
    order.className = 'batch-order';
    order.textContent = String(index + 1);

    const information = document.createElement('div');
    information.className = 'batch-item-info';
    const key = document.createElement('code');
    key.className = 'batch-key';
    key.title = item.accessKey;
    key.textContent = abbreviateAccessKey(item.accessKey);
    information.append(key);

    const details = document.createElement('span');
    details.className = 'batch-details';
    if (item.parsed) {
      const invoice = item.parsed.number ? `NF-e ${item.parsed.number}` : 'NF-e';
      const series = item.parsed.series ? ` · Série ${item.parsed.series}` : '';
      const issuer = item.parsed.issuer.name ? ` · ${item.parsed.issuer.name}` : '';
      const value = Number.isFinite(item.parsed.totals.invoice)
        ? ` · ${formatCurrency(item.parsed.totals.invoice)}`
        : '';
      details.textContent = `${invoice}${series}${issuer}${value}`;
    } else {
      details.textContent = item.message ?? statusLabel(item.status);
    }
    information.append(details);

    const status = document.createElement('div');
    status.className = 'batch-status';
    const badge = document.createElement('span');
    badge.className = 'batch-status-badge';
    badge.textContent = statusLabel(item.status);
    status.append(badge);
    if (item.source) {
      const source = document.createElement('span');
      source.className = 'batch-source';
      source.textContent = item.source;
      status.append(source);
    }

    const actions = document.createElement('div');
    actions.className = 'batch-item-actions';
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'batch-action';
    preview.textContent = 'Visualizar DANFE';
    preview.disabled = item.parsed === null;
    preview.addEventListener('click', () => {
      if (item.parsed) openDanfe(item.parsed);
    });

    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'batch-action batch-download';
    download.textContent = 'Baixar XML';
    download.disabled = item.parsed === null;
    download.addEventListener('click', () => {
      if (item.parsed) downloadXml(item.parsed);
    });
    actions.append(preview, download);

    if (item.status === 'portal_error') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'batch-action';
      retry.textContent = 'Tentar pelo Portal';
      retry.disabled = batchRunning || batchManualPortalBusy;
      retry.addEventListener('click', () => {
        void retryBatchPortal(index);
      });
      actions.append(retry);
    }

    row.append(order, information, status, actions);
    batchList.append(row);
  });
}

function downloadBatchZip(): void {
  const completed = completedBatchItems();
  if (completed.length === 0) return;

  const blob = createStoredZip(completed.map((item) => ({
    name: `${item.parsed!.accessKey}.xml`,
    content: item.parsed!.originalXml,
  })));
  downloadBlob(blob, `nfe-lote-${new Date().toISOString().slice(0, 10)}.zip`);
}

function printBatchDanfes(): void {
  const parsed = completedBatchItems()
    .map((item) => item.parsed)
    .filter((item): item is ParsedNfe => item !== null);
  if (parsed.length === 0) return;
  openDanfeDocuments(parsed, `DANFEs do lote · ${parsed.length} NF-e`);
  window.print();
}

function isBatchPortalRoute(): boolean {
  return batchRoute === 'portal';
}

function completedBatchItems(): BatchItem[] {
  return batchItems.filter((item) => item.status === 'success' && item.parsed !== null);
}

function createBatchItem(accessKey: string): BatchItem {
  return {
    accessKey,
    status: 'queued',
    message: 'Aguardando processamento.',
    parsed: null,
    source: null,
  };
}

function markQueuedBatchItems(status: BatchItemStatus, message: string | null): void {
  for (const item of batchItems) {
    if (item.status !== 'queued' && item.status !== 'portal_queued') continue;
    item.status = status;
    item.message = message;
  }
}

function setBatchControlsRunning(running: boolean): void {
  batchKeysInput.disabled = running;
  batchStart.disabled = running;
  batchCancel.hidden = !running;
  modeSingle.disabled = running;
  modeBatch.disabled = running;
  setCertificateControlsEnabled(!running && certificateSelect.options.length > 1);
}

function setBatchControlsLocked(locked: boolean): void {
  batchKeysInput.disabled = locked;
  batchStart.disabled = locked || parseBatchInput(batchKeysInput.value).validKeys.length === 0;
  modeSingle.disabled = locked;
  modeBatch.disabled = locked;
  setCertificateControlsEnabled(!locked && certificateSelect.options.length > 1);
}

function isTerminalBatchStatus(status: BatchItemStatus): boolean {
  return status === 'success'
    || status === 'fiscal_status'
    || status === 'transport_error'
    || status === 'portal_error'
    || status === 'cancelled';
}

function statusLabel(status: BatchItemStatus): string {
  switch (status) {
    case 'consulting': return 'Consultando SEFAZ';
    case 'portal_queued': return 'Aguardando Portal';
    case 'portal_waiting_user': return 'Resolva o hCaptcha';
    case 'success': return 'Concluída';
    case 'fiscal_status': return 'Resultado fiscal';
    case 'transport_error': return 'Erro de consulta';
    case 'portal_error': return 'Erro no Portal';
    case 'cancelled': return 'Cancelada';
    default: return 'Aguardando';
  }
}

function abbreviateAccessKey(accessKey: string): string {
  return `${accessKey.slice(0, 8)}…${accessKey.slice(-8)}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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
  openDanfeDocuments([parsed], `Visualizar DANFE · NF-e ${parsed.number || parsed.accessKey}`);
}

function openDanfeDocuments(parsed: readonly ParsedNfe[], title: string): void {
  detachDanfeZoom?.();
  danfeContent.replaceChildren(...parsed.map((item) => renderDanfe(item)));
  danfeTitle.textContent = title;
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
  modeBatch.disabled = busy;
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
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
