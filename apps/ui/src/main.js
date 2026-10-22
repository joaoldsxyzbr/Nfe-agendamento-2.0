import { createBatchController } from './batch/controller.js';
import { actionIconMarkup } from './ui/action-icons.js';
import { parseBatchInput } from './batch/input.js';
import { createStoredZip } from './batch/zip.js';
import { attachDanfeZoom, renderDanfe } from './danfe/render.js';
import { createDanfeViewer } from './danfe/viewer.js';
import { validateManualNfeXml } from './nfe/manual-xml-import.js';
import { parseNfeXml } from './nfe/xml.js';
import { BrowserPortalExtensionClient } from './portal/extension-client.js';
import { BATCH_DRAFT_DEBOUNCE_MS, ZIP_DOWNLOAD_DELAY_MS } from './shared/constants.js';
import { logger } from './shared/logger.js';
import { metrics } from './shared/metrics.js';
import { initTheme, cycleTheme } from './shared/theme.js';
import { createKeyboardShortcuts } from './shared/keyboard-shortcuts.js';
import { downloadCsv } from './shared/csv-report.js';

initTheme();

const app = document.querySelector('#app');
if (!app) {
    throw new Error('Elemento #app não encontrado.');
}
app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-heading">
        <div class="brand-lockup">
          <img class="brand-mark" src="./brand-mark.png" alt="" aria-hidden="true" />
          <h1 class="brand-title"><span>NF-e</span><span>Agendamento</span></h1>
        </div>
        <p class="subtitle">Consulta de NF-e pelo Portal Nacional.</p>
      </div>
      <div class="topbar-controls" id="topbar-controls">
        <div class="integration-pill" id="integration-status" data-state="checking" role="status" aria-live="polite">
          <span class="integration-dot" aria-hidden="true"></span>
          <span id="integration-status-text">Verificando extensão…</span>
        </div>
      </div>
    </header>

    <section class="lookup-card" aria-labelledby="lookup-title">
      <div class="section-heading lookup-heading">
        <h2 id="lookup-title">Consulta de NF-e</h2>
        <span class="key-hint">Uma chave ou várias</span>
      </div>

      <div id="batch-consultation-panel">
        <form id="batch-form" novalidate>
          <div class="batch-input-label">
            <label for="batch-keys">Digite a chave de acesso</label>
            <span id="batch-key-count" aria-live="polite">Qtd. caracteres: 0</span>
          </div>
          <textarea
            id="batch-keys"
            rows="1"
            autocomplete="off"
            inputmode="numeric"
            spellcheck="false"
            placeholder="Digite ou cole a chave de 44 dígitos"
            aria-describedby="batch-help batch-input-summary batch-key-count"
          ></textarea>
          <div class="batch-form-footer">
            <div>
              <p id="batch-input-summary" class="batch-summary" aria-live="polite">Informe uma chave para consultar.</p>
              <p id="batch-help" class="help-text">Lote: uma chave por linha. hCaptcha manual no Portal Nacional. Atalhos: Ctrl+Enter consultar, Ctrl+N nova, Ctrl+Shift+T tema.</p>
            </div>
            <div class="batch-actions" aria-label="Ações da consulta">
              <button id="batch-reset" class="lookup-reset batch-reset" type="button">${actionIconMarkup('new')}<span>Nova consulta</span></button>
              <button id="batch-start" type="submit" disabled>${actionIconMarkup('consult')}<span>Consultar nota</span></button>
            </div>
          </div>
        </form>

        <div class="batch-run-toolbar" id="batch-run-toolbar" hidden>
          <div class="batch-progress-copy" aria-live="polite">
            <strong id="batch-progress">0 de 0</strong>
            <span id="batch-route">Aguardando início</span>
          </div>
          <div class="batch-toolbar-actions">
            <button id="batch-cancel" class="secondary-button" type="button" hidden>${actionIconMarkup('cancel')}<span>Cancelar consulta</span></button>
            <button id="batch-csv" class="secondary-button" type="button" disabled title="Baixar relatório CSV">${actionIconMarkup("csv")}<span>Relatório CSV</span></button>
            <button id="batch-zip" class="secondary-button" type="button" disabled>${actionIconMarkup('zip')}<span>Baixar XMLs (.zip)</span></button>
            <button id="batch-print" class="secondary-button" type="button" disabled>${actionIconMarkup('print')}<span>Imprimir DANFEs</span></button>
          </div>
        </div>

        <div id="batch-list" class="batch-list" aria-live="polite" hidden></div>
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
const portalExtension = new BrowserPortalExtensionClient();
const integrationStatus = requireElement('#integration-status');
const integrationStatusText = requireElement('#integration-status-text');
const batchForm = requireElement('#batch-form');
const batchKeysInput = requireElement('#batch-keys');
const batchInputSummary = requireElement('#batch-input-summary');
const batchKeyCount = requireElement('#batch-key-count');
const batchRunToolbar = requireElement('#batch-run-toolbar');
const batchStart = requireElement('#batch-start');
const batchReset = requireElement('#batch-reset');
const batchProgress = requireElement('#batch-progress');
const batchRouteText = requireElement('#batch-route');
const batchCancel = requireElement('#batch-cancel');
const batchCsv = requireElement('#batch-csv');
const batchZip = requireElement('#batch-zip');
const batchPrint = requireElement('#batch-print');
const batchList = requireElement('#batch-list');
const danfeViewer = requireElement('#danfe-viewer');
const danfeTitle = requireElement('#danfe-title');
const danfeContent = requireElement('#danfe-content');
const danfeClose = requireElement('#danfe-close');
const danfePrint = requireElement('#danfe-print');
let batchDraftTimer = null;
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
    getActiveElement: () => document.activeElement,
    print: () => window.print(),
});

metrics.start('batch-controller-init');
const batchController = createBatchController({
    elements: {
        keysInput: batchKeysInput,
        inputSummary: batchInputSummary,
        startButton: batchStart,
        resetButton: batchReset,
        cancelButton: batchCancel,
        csvButton: batchCsv,
        zipButton: batchZip,
        printButton: batchPrint,
        progress: batchProgress,
        routeText: batchRouteText,
        toolbar: batchRunToolbar,
        list: batchList,
    },
    portal: portalExtension,
    parseXml: parseNfeXml,
    createZip: createStoredZip,
    downloadBlob,
    openDanfe: (parsed) => danfeViewerController.open(parsed),
    downloadXml,
    openDanfeDocuments: (documents, title) => danfeViewerController.openMany(documents, title),
    printWindow: () => danfeViewerController.print(),
    importManualXml: selectManualXml,
    downloadCsv: (items) => downloadCsv(items, `nfe-lote-${new Date().toISOString().slice(0, 10)}.csv`),
});
metrics.end('batch-controller-init');
logger.info('Batch controller inicializado');

batchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    metrics.start('batch-consult');
    void batchController.start().finally(() => {
        const elapsed = metrics.end('batch-consult');
        if (elapsed !== null) logger.info(`Consulta finalizada em ${elapsed}ms`);
    });
});
batchKeysInput.addEventListener('input', () => {
    updateKeyCount();
    scheduleBatchDraftSync();
});
batchReset.addEventListener('click', () => {
    batchController.reset();
    updateKeyCount();
});
batchCancel.addEventListener('click', () => {
    void batchController.cancel();
});
batchCsv.addEventListener('click', () => batchController.downloadCsvReport());
batchZip.addEventListener('click', () => batchController.downloadZip());
batchPrint.addEventListener('click', () => batchController.printDanfes());

const shortcuts = createKeyboardShortcuts({
    onConsult: () => {
        if (!batchStart.disabled) {
            batchForm.requestSubmit();
        }
    },
    onNew: () => batchReset.click(),
    onCancel: () => {
        if (danfeViewer.hidden === false) {
            danfeViewerController.close();
        } else if (!batchCancel.hidden) {
            void batchController.cancel();
        }
    },
    onPrint: () => {
        if (danfeViewer.hidden === false) {
            danfeViewerController.print();
        } else if (!batchPrint.disabled) {
            batchController.printDanfes();
        }
    },
    onZip: () => {
        if (!batchZip.disabled) {
            batchController.downloadZip();
        }
    },
    onTheme: () => {
        const next = cycleTheme();
        logger.info(`Tema alterado para: ${next}`);
        showThemeToast(next);
    },
});

function showThemeToast(theme) {
    const labels = { dark: 'Escuro', light: 'Claro', system: 'Sistema' };
    let toast = document.querySelector('.theme-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'theme-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.append(toast);
    }
    toast.textContent = `Tema: ${labels[theme] ?? theme}`;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
}

const stopExtensionReadyHint = portalExtension.onReadyHint(() => {
    void refreshExtensionStatus();
});
window.addEventListener('focus', () => void refreshExtensionStatus());
window.addEventListener('pageshow', () => void refreshExtensionStatus());
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
        void refreshExtensionStatus();
});
window.addEventListener('pagehide', () => {
    if (batchDraftTimer !== null)
        globalThis.clearTimeout(batchDraftTimer);
    stopExtensionReadyHint();
    shortcuts.dispose();
    danfeViewerController.dispose();
    batchController.dispose();
});

void refreshExtensionStatus();
batchController.syncDraft();
updateKeyCount();
batchKeysInput.focus();

function updateKeyCount() {
    const value = batchKeysInput.value.trim();
    const summary = parseBatchInput(value);
    const digits = value.replace(/[^0-9]/g, '').length;
    batchKeyCount.textContent = summary.totalCandidates > 1
        ? `Qtd. chaves: ${summary.totalCandidates}`
        : `Qtd. caracteres: ${digits}`;
}
function scheduleBatchDraftSync() {
    if (batchDraftTimer !== null)
        globalThis.clearTimeout(batchDraftTimer);
    batchDraftTimer = globalThis.setTimeout(() => {
        batchDraftTimer = null;
        batchController.syncDraft();
    }, BATCH_DRAFT_DEBOUNCE_MS);
}
async function refreshExtensionStatus() {
    const info = await portalExtension.getInfo();
    if (info) {
        integrationStatus.dataset.state = 'connected';
        integrationStatusText.textContent = `Extensão conectada · v${info.version}`;
        return;
    }
    integrationStatus.dataset.state = 'disconnected';
    integrationStatusText.textContent = 'Extensão não conectada';
}
function selectManualXml(accessKey) {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xml,application/xml,text/xml';
        input.hidden = true;
        let settled = false;
        const finish = (complete) => {
            if (settled)
                return;
            settled = true;
            input.remove();
            complete();
        };
        input.addEventListener('cancel', () => finish(() => resolve(null)), { once: true });
        input.addEventListener('change', () => {
            const file = input.files?.item(0) ?? null;
            if (!file) {
                finish(() => resolve(null));
                return;
            }
            void validateManualNfeXml(file, accessKey)
                .then((parsed) => finish(() => resolve(parsed)))
                .catch((error) => finish(() => reject(error)));
        }, { once: true });
        document.body.append(input);
        input.click();
    });
}
function downloadXml(parsed) {
    const blob = new Blob([parsed.originalXml], { type: 'application/xml;charset=utf-8' });
    downloadBlob(blob, `${parsed.accessKey}.xml`);
}
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), ZIP_DOWNLOAD_DELAY_MS);
}
function requireElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Elemento ${selector} não encontrado.`);
    return element;
}
