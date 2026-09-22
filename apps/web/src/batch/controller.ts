import type {
  DirectLookupResult,
  PortalOperationStatus,
  SupplierResolution,
} from '../portal/contracts';
import type { PortalExtensionInfo } from '../portal/extension-client';
import type { ParsedNfe } from '../nfe/xml';
import { MAX_BATCH_ITEMS, parseBatchInput } from './input';

export type BatchItemStatus =
  | 'queued'
  | 'consulting'
  | 'portal_queued'
  | 'portal_waiting_user'
  | 'success'
  | 'fiscal_status'
  | 'transport_error'
  | 'portal_error'
  | 'cancelled';

export type BatchSource = 'SEFAZ' | 'Portal';
type BatchRoute = 'sefaz' | 'portal';

export type BatchItemView = Readonly<{
  accessKey: string;
  status: BatchItemStatus;
  message: string | null;
  parsed: ParsedNfe | null;
  source: BatchSource | null;
}>;

type MutableBatchItem = {
  accessKey: string;
  status: BatchItemStatus;
  message: string | null;
  parsed: ParsedNfe | null;
  source: BatchSource | null;
};

type ExtensionBatchClient = Readonly<{
  getInfo(signal?: AbortSignal): Promise<PortalExtensionInfo | null>;
  openOptions(signal?: AbortSignal): Promise<void>;
  directLookup(accessKey: string, signal?: AbortSignal): Promise<DirectLookupResult>;
  start(accessKey: string, signal?: AbortSignal): Promise<string>;
  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus>;
  cancel(operationId: string): Promise<void>;
  resolveSupplier(taxId: string): Promise<SupplierResolution>;
}>;

type ZipEntry = Readonly<{ name: string; content: string }>;

export type BatchControllerDependencies = Readonly<{
  elements: Readonly<{
    keysInput: HTMLTextAreaElement;
    inputSummary: HTMLElement;
    startButton: HTMLButtonElement;
    cancelButton: HTMLButtonElement;
    zipButton: HTMLButtonElement;
    printButton: HTMLButtonElement;
    progress: HTMLElement;
    routeText: HTMLElement;
    modeSingleButton: HTMLButtonElement;
    modeBatchButton: HTMLButtonElement;
    list?: HTMLElement;
  }>;
  portal: ExtensionBatchClient;
  parseXml(xml: string, accessKey: string): ParsedNfe;
  createZip(entries: readonly ZipEntry[]): Blob;
  downloadBlob(blob: Blob, filename: string): void;
  openDanfe(parsed: ParsedNfe): void;
  downloadXml(parsed: ParsedNfe): void;
  openDanfeDocuments(documents: readonly ParsedNfe[], title: string): void;
  printWindow(): void;
  renderRows?: (items: readonly BatchItemView[]) => void;
  document?: Document;
}>;

export type BatchController = Readonly<{
  syncDraft(): void;
  start(): Promise<void>;
  cancel(): Promise<void>;
  downloadZip(): void;
  printDanfes(): void;
  isBusy(): boolean;
  dispose(): void;
}>;

export function createBatchController(deps: BatchControllerDependencies): BatchController {
  const { elements } = deps;
  let items: MutableBatchItem[] = [];
  let running = false;
  let preflighting = false;
  let manualPortalBusy = false;
  let cancelled = false;
  let route: BatchRoute = 'sefaz';
  let abortController: AbortController | null = null;
  let activePortalOperationId: string | null = null;

  function syncDraft(): void {
    if (running || preflighting || manualPortalBusy) return;
    const summary = parseBatchInput(elements.keysInput.value);
    const parts = [
      `${summary.validKeys.length} válida${summary.validKeys.length === 1 ? '' : 's'}`,
      `${summary.invalidCount} inválida${summary.invalidCount === 1 ? '' : 's'}`,
      `${summary.duplicateCount} duplicada${summary.duplicateCount === 1 ? '' : 's'}`,
    ];
    elements.inputSummary.textContent = summary.totalCandidates === 0
      ? 'Nenhuma chave informada.'
      : parts.join(' · ');
    if (summary.exceedsLimit) elements.inputSummary.textContent += ` · máximo ${MAX_BATCH_ITEMS} por lote`;
    elements.startButton.disabled = summary.validKeys.length === 0 || summary.exceedsLimit;
    items = summary.validKeys.map(createBatchItem);
    route = 'sefaz';
    renderState('Aguardando início');
  }

  async function start(): Promise<void> {
    if (running || preflighting || manualPortalBusy) return;
    const summary = parseBatchInput(elements.keysInput.value);
    if (summary.validKeys.length === 0 || summary.exceedsLimit) {
      syncDraft();
      return;
    }

    preflighting = true;
    setControlsLocked(true);
    renderState('Verificando configuração');

    try {
      const info = await deps.portal.getInfo();
      if (!info) {
        renderState('Extensão não conectada');
        elements.routeText.textContent = 'Extensão não conectada. Instale ou ative a extensão antes de iniciar o lote.';
        return;
      }
      if (!info.capabilities.directLookup) {
        renderState('Atualize a extensão');
        elements.routeText.textContent = 'Atualize a extensão para usar a consulta direta à SEFAZ.';
        return;
      }
      if (!info.configuration.fiscalIdentityConfigured) {
        if (!info.capabilities.openOptions) {
          renderState('Atualize a extensão');
          elements.routeText.textContent = 'Sua extensão é antiga. Atualize pela seta de download ou abra o ícone NFe Agendamento e configure o CNPJ do A1 manualmente.';
          return;
        }

        let opened = false;
        try {
          await deps.portal.openOptions();
          opened = true;
        } catch {}

        renderState('Configure o CNPJ do A1');
        elements.routeText.textContent = opened
          ? 'A configuração da extensão foi aberta. Salve o CNPJ do A1 e inicie o lote novamente.'
          : 'Não foi possível abrir a configuração automaticamente. Clique no ícone NFe Agendamento, configure o CNPJ do A1 e tente novamente.';
        return;
      }
    } finally {
      preflighting = false;
      setControlsLocked(false);
    }

    items = summary.validKeys.map(createBatchItem);
    running = true;
    cancelled = false;
    route = 'sefaz';
    abortController = new AbortController();
    setControlsRunning(true);
    renderState('Preparando lote');
    let finalFailureMessage: string | null = null;

    try {
      for (const item of items) {
        if (cancelled) break;
        if (isPortalRoute()) {
          item.status = 'portal_queued';
          item.message = 'SEFAZ em proteção; aguardando consulta pelo Portal.';
          renderState('Lote seguindo pelo Portal');
          await processPortalItem(item, abortController.signal);
        } else {
          await processDirectItem(item, abortController.signal);
        }
      }
    } catch (error) {
      if (!isAbortError(error)) {
        finalFailureMessage = error instanceof Error ? error.message : 'Não foi possível iniciar o lote.';
        markQueuedItems('cancelled', 'Não processada porque o lote foi interrompido.');
      }
    } finally {
      if (cancelled) markQueuedItems('cancelled', 'Não processada porque o lote foi cancelado.');
      running = false;
      abortController = null;
      setControlsRunning(false);
      renderState(cancelled ? 'Lote cancelado' : finalFailureMessage ?? 'Lote concluído');
    }
  }

  async function processDirectItem(item: MutableBatchItem, signal: AbortSignal): Promise<void> {
    item.status = 'consulting';
    item.message = 'Consultando SEFAZ…';
    renderState('Consultando SEFAZ');

    try {
      const lookup = await deps.portal.directLookup(item.accessKey, signal);
      if (lookup.category === 'success' && lookup.xml) {
        await completeItem(item, lookup.xml, 'SEFAZ');
        return;
      }

      if (lookup.category === 'consumption_limit') {
        route = 'portal';
        item.status = 'portal_queued';
        item.message = lookup.message;
        renderState('SEFAZ em proteção · seguindo pelo Portal');
        await processPortalItem(item, signal);
        return;
      }

      if (lookup.category === 'fiscal_status' && lookup.cStat === '217') {
        item.status = 'portal_queued';
        item.message = 'NF-e não localizada na consulta direta. Tentando pelo Portal.';
        renderState('Fallback pelo Portal');
        await processPortalItem(item, signal);
        return;
      }

      if (lookup.category === 'configuration_error') {
        item.status = 'transport_error';
        item.message = lookup.message;
        cancelled = true;
        return;
      }

      item.status = lookup.category === 'fiscal_status' ? 'fiscal_status' : 'transport_error';
      item.message = lookup.cStat
        ? `Status SEFAZ ${lookup.cStat}. ${lookup.message}`
        : lookup.message;
    } catch (error) {
      if (isAbortError(error) && cancelled) {
        item.status = 'cancelled';
        item.message = 'Consulta cancelada pelo usuário.';
        return;
      }
      throw error;
    } finally {
      renderState(isPortalRoute() ? 'Lote seguindo pelo Portal' : 'Consultando SEFAZ');
    }
  }

  async function processPortalItem(item: MutableBatchItem, signal?: AbortSignal): Promise<void> {
    item.status = 'portal_queued';
    item.message = 'Abrindo Portal Nacional…';
    renderState('Abrindo Portal Nacional');

    try {
      const operationId = await deps.portal.start(item.accessKey, signal);
      activePortalOperationId = operationId;
      item.status = 'portal_waiting_user';
      item.message = 'Resolva o hCaptcha na janela do Portal.';
      renderState('Resolva o hCaptcha');

      const status = await deps.portal.waitForResult(operationId, signal);
      if (status.state === 'completed' && status.xml) {
        await completeItem(item, status.xml, 'Portal');
        return;
      }
      if (status.state === 'cancelled') {
        item.status = cancelled ? 'cancelled' : 'portal_error';
        item.message = status.message ?? 'Consulta pelo Portal cancelada.';
        return;
      }
      item.status = 'portal_error';
      item.message = status.message ?? 'O Portal não retornou o XML desta NF-e.';
    } catch (error) {
      if (isAbortError(error) && cancelled) {
        item.status = 'cancelled';
        item.message = 'Consulta pelo Portal cancelada pelo usuário.';
        return;
      }
      item.status = 'portal_error';
      item.message = error instanceof Error ? error.message : 'Não foi possível concluir a consulta pelo Portal.';
    } finally {
      activePortalOperationId = null;
      renderState(isPortalRoute() ? 'Lote seguindo pelo Portal' : 'Consultando lote');
    }
  }

  async function completeItem(item: MutableBatchItem, xml: string, source: BatchSource): Promise<void> {
    try {
      const parsed = deps.parseXml(xml, item.accessKey);
      let supplierRuleId: string | null = null;
      try {
        supplierRuleId = (await deps.portal.resolveSupplier(parsed.issuer.taxId)).supplierId;
      } catch {
        supplierRuleId = null;
      }
      item.parsed = { ...parsed, supplierRuleId };
      item.source = source;
      item.status = 'success';
      item.message = `XML validado via ${source}.`;
    } catch (error) {
      item.status = source === 'Portal' ? 'portal_error' : 'transport_error';
      item.message = error instanceof Error ? error.message : 'O XML retornado não pôde ser validado.';
    }
  }

  async function cancel(): Promise<void> {
    if (!running) return;
    cancelled = true;
    abortController?.abort();
    const operationId = activePortalOperationId;
    if (!operationId) return;
    try { await deps.portal.cancel(operationId); } catch {}
  }

  async function retryPortal(index: number): Promise<void> {
    const item = items[index];
    if (!item || item.status !== 'portal_error' || running || manualPortalBusy) return;
    manualPortalBusy = true;
    setControlsLocked(true);
    try { await processPortalItem(item); }
    finally {
      manualPortalBusy = false;
      setControlsLocked(false);
      renderState('Reconsulta pelo Portal concluída');
    }
  }

  function renderState(label: string): void {
    const terminal = items.filter((item) => isTerminalStatus(item.status)).length;
    const completed = completedItems();
    elements.progress.textContent = `${terminal} de ${items.length}`;
    elements.routeText.textContent = running
      ? `${label} · rota ${isPortalRoute() ? 'Portal' : 'SEFAZ'}`
      : label;
    elements.zipButton.disabled = completed.length === 0 || preflighting || running || manualPortalBusy;
    elements.printButton.disabled = completed.length === 0 || preflighting || running || manualPortalBusy;
    renderRows();
  }

  function renderRows(): void {
    if (deps.renderRows) {
      deps.renderRows(items);
      return;
    }
    const list = elements.list;
    if (!list) throw new Error('BatchController requer elements.list quando renderRows não é fornecido.');
    const documentRef = deps.document ?? document;
    list.replaceChildren();

    if (items.length === 0) {
      const empty = documentRef.createElement('div');
      empty.className = 'empty-state batch-empty';
      const title = documentRef.createElement('strong');
      title.textContent = 'Nenhuma chave no lote';
      const message = documentRef.createElement('span');
      message.textContent = 'Cole as chaves acima para montar a lista.';
      empty.append(title, message);
      list.append(empty);
      return;
    }

    items.forEach((item, index) => {
      const row = documentRef.createElement('article');
      row.className = 'batch-item';
      row.dataset.state = item.status;
      const order = documentRef.createElement('span');
      order.className = 'batch-order';
      order.textContent = String(index + 1);

      const information = documentRef.createElement('div');
      information.className = 'batch-item-info';
      const key = documentRef.createElement('code');
      key.className = 'batch-key';
      key.title = item.accessKey;
      key.textContent = abbreviateAccessKey(item.accessKey);
      information.append(key);

      const details = documentRef.createElement('span');
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

      const status = documentRef.createElement('div');
      status.className = 'batch-status';
      const badge = documentRef.createElement('span');
      badge.className = 'batch-status-badge';
      badge.textContent = statusLabel(item.status);
      status.append(badge);
      if (item.source) {
        const source = documentRef.createElement('span');
        source.className = 'batch-source';
        source.textContent = item.source;
        status.append(source);
      }

      const actions = documentRef.createElement('div');
      actions.className = 'batch-item-actions';
      const preview = documentRef.createElement('button');
      preview.type = 'button';
      preview.className = 'batch-action';
      preview.textContent = 'Visualizar DANFE';
      preview.disabled = item.parsed === null;
      preview.addEventListener('click', () => { if (item.parsed) deps.openDanfe(item.parsed); });

      const download = documentRef.createElement('button');
      download.type = 'button';
      download.className = 'batch-action batch-download';
      download.textContent = 'Baixar XML';
      download.disabled = item.parsed === null;
      download.addEventListener('click', () => { if (item.parsed) deps.downloadXml(item.parsed); });
      actions.append(preview, download);

      if (item.status === 'portal_error') {
        const retry = documentRef.createElement('button');
        retry.type = 'button';
        retry.className = 'batch-action';
        retry.textContent = 'Tentar pelo Portal';
        retry.disabled = running || manualPortalBusy;
        retry.addEventListener('click', () => void retryPortal(index));
        actions.append(retry);
      }

      row.append(order, information, status, actions);
      list.append(row);
    });
  }

  function downloadZip(): void {
    const completed = completedItems();
    if (completed.length === 0) return;
    const blob = deps.createZip(completed.map((item) => ({
      name: `${item.parsed!.accessKey}.xml`,
      content: item.parsed!.originalXml,
    })));
    deps.downloadBlob(blob, `nfe-lote-${new Date().toISOString().slice(0, 10)}.zip`);
  }

  function printDanfes(): void {
    const parsed = completedItems()
      .map((item) => item.parsed)
      .filter((item): item is ParsedNfe => item !== null);
    if (parsed.length === 0) return;
    deps.openDanfeDocuments(parsed, `DANFEs do lote · ${parsed.length} NF-e`);
    deps.printWindow();
  }

  function completedItems(): MutableBatchItem[] {
    return items.filter((item) => item.status === 'success' && item.parsed !== null);
  }

  function isPortalRoute(): boolean {
    return route === 'portal';
  }

  function markQueuedItems(status: BatchItemStatus, message: string | null): void {
    for (const item of items) {
      if (item.status !== 'queued' && item.status !== 'portal_queued') continue;
      item.status = status;
      item.message = message;
    }
  }

  function setControlsRunning(value: boolean): void {
    elements.keysInput.disabled = value;
    elements.startButton.disabled = value;
    elements.cancelButton.hidden = !value;
    elements.modeSingleButton.disabled = value;
    elements.modeBatchButton.disabled = value;
  }

  function setControlsLocked(locked: boolean): void {
    elements.keysInput.disabled = locked;
    elements.startButton.disabled = locked || parseBatchInput(elements.keysInput.value).validKeys.length === 0;
    elements.modeSingleButton.disabled = locked;
    elements.modeBatchButton.disabled = locked;
  }

  function dispose(): void {
    abortController?.abort();
    const operationId = activePortalOperationId;
    activePortalOperationId = null;
    if (operationId) void deps.portal.cancel(operationId).catch(() => {});
  }

  return {
    syncDraft,
    start,
    cancel,
    downloadZip,
    printDanfes,
    isBusy: () => preflighting || running || manualPortalBusy,
    dispose,
  };
}

function createBatchItem(accessKey: string): MutableBatchItem {
  return { accessKey, status: 'queued', message: 'Aguardando processamento.', parsed: null, source: null };
}

function isTerminalStatus(status: BatchItemStatus): boolean {
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
