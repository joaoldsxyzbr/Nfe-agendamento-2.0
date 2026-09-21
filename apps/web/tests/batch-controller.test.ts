import { describe, expect, it } from 'vitest';
import type { NfeLookupResult, PortalOperationStatus, SupplierResolution } from '../src/bridge/contracts';
import type { ParsedNfe } from '../src/nfe/xml';
import {
  createBatchController,
  type BatchControllerDependencies,
  type BatchItemView,
} from '../src/batch/controller';

const KEY_A = '42260812345678000123550010000012341000012342';
const KEY_B = '35260812345678000195550010000000011000000018';
const KEY_C = '41260612ABC34501DE35550010000001231876543214';

function success(xml = '<nfe/>'): NfeLookupResult {
  return { category: 'success', xml, cStat: '138', message: null };
}

function portalCompleted(operationId: string, xml = '<nfe/>'): PortalOperationStatus {
  return { operationId, state: 'completed', message: null, xml };
}

type HarnessOptions = {
  lookup?: (accessKey: string, signal?: AbortSignal, requestId?: string) => Promise<NfeLookupResult>;
  resolveSupplier?: (taxId: string, signal?: AbortSignal) => Promise<SupplierResolution>;
  portalStart?: (accessKey: string, signal?: AbortSignal) => Promise<string>;
  portalWait?: (operationId: string, signal?: AbortSignal) => Promise<PortalOperationStatus>;
};

function createHarness(options: HarnessOptions = {}) {
  const input = { value: '', disabled: false } as HTMLTextAreaElement;
  const summary = { textContent: '' } as HTMLElement;
  const start = { disabled: false } as HTMLButtonElement;
  const cancel = { hidden: true } as HTMLButtonElement;
  const zip = { disabled: true } as HTMLButtonElement;
  const print = { disabled: true } as HTMLButtonElement;
  const progress = { textContent: '' } as HTMLElement;
  const route = { textContent: '' } as HTMLElement;
  const modeSingle = { disabled: false } as HTMLButtonElement;
  const modeBatch = { disabled: false } as HTMLButtonElement;

  const rendered: BatchItemView[][] = [];
  const lookups: string[] = [];
  const lookupRequestIds: Array<string | undefined> = [];
  const supplierResolutions: string[] = [];
  const portalStarts: string[] = [];
  const portalCancels: string[] = [];
  const zipEntries: Array<{ name: string; content: string }> = [];
  const downloads: Array<{ blob: Blob; filename: string }> = [];
  const printedDocuments: ParsedNfe[][] = [];
  let printCalls = 0;

  const deps: BatchControllerDependencies = {
    elements: {
      keysInput: input,
      inputSummary: summary,
      startButton: start,
      cancelButton: cancel,
      zipButton: zip,
      printButton: print,
      progress,
      routeText: route,
      modeSingleButton: modeSingle,
      modeBatchButton: modeBatch,
    },
    bridge: {
      health: async () => ({
        version: 'test',
        status: 'ok',
        webView2Available: true,
        certificateSelected: true,
      }),
      lookupNfe: async (accessKey, signal, requestId) => {
        lookups.push(accessKey);
        lookupRequestIds.push(requestId);
        return options.lookup?.(accessKey, signal, requestId) ?? success(`<nfe key="${accessKey}"/>`);
      },
      resolveSupplier: async (taxId, signal) => {
        supplierResolutions.push(taxId);
        return options.resolveSupplier?.(taxId, signal) ?? { supplierId: null };
      },
    },
    portal: {
      start: async (accessKey, signal) => {
        portalStarts.push(accessKey);
        return options.portalStart?.(accessKey, signal) ?? `op-${portalStarts.length}`;
      },
      waitForResult: async (operationId, signal) => (
        options.portalWait?.(operationId, signal) ?? portalCompleted(operationId)
      ),
      cancel: async (operationId) => {
        portalCancels.push(operationId);
      },
    },
    parseXml: (xml, accessKey) => ({
      accessKey,
      originalXml: xml,
      number: accessKey.slice(-8),
      series: '1',
      issuer: { name: 'Emitente teste', taxId: '12345678000195' },
      totals: { invoice: 10 },
    } as ParsedNfe),
    createZip: (entries) => {
      zipEntries.splice(0, zipEntries.length, ...entries);
      return new Blob(entries.map((entry) => entry.content));
    },
    downloadBlob: (blob, filename) => {
      downloads.push({ blob, filename });
    },
    openDanfe: () => undefined,
    downloadXml: () => undefined,
    openDanfeDocuments: (documents) => {
      printedDocuments.push([...documents]);
    },
    printWindow: () => {
      printCalls += 1;
    },
    setCertificateControlsEnabled: () => undefined,
    hasSelectableCertificates: () => true,
    renderRows: (items) => {
      rendered.push(items.map((item) => ({ ...item })));
    },
  };

  const controller = createBatchController(deps);

  return {
    controller,
    input,
    summary,
    start,
    cancel,
    zip,
    print,
    progress,
    route,
    rendered,
    lookups,
    lookupRequestIds,
    supplierResolutions,
    portalStarts,
    portalCancels,
    zipEntries,
    downloads,
    printedDocuments,
    get printCalls() { return printCalls; },
  };
}

function lastItems(harness: ReturnType<typeof createHarness>): BatchItemView[] {
  return harness.rendered.at(-1) ?? [];
}

describe('batch controller', () => {
  it('disables start for empty or invalid drafts and preserves valid unique order', () => {
    const harness = createHarness();

    harness.input.value = '12345';
    harness.controller.syncDraft();
    expect(harness.start.disabled).toBe(true);
    expect(harness.summary.textContent).toContain('0 válida');

    harness.input.value = `${KEY_A}\n${KEY_B}\n${KEY_A}`;
    harness.controller.syncDraft();

    expect(harness.start.disabled).toBe(false);
    expect(lastItems(harness).map((item) => item.accessKey)).toEqual([KEY_A, KEY_B]);
    expect(lastItems(harness).map((item) => item.status)).toEqual(['queued', 'queued']);
  });

  it('generates one UUID requestId for each direct batch item', async () => {
    const harness = createHarness();
    harness.input.value = `${KEY_A}\n${KEY_B}`;
    harness.controller.syncDraft();

    await harness.controller.start();

    expect(harness.lookupRequestIds).toHaveLength(2);
    expect(new Set(harness.lookupRequestIds).size).toBe(2);
    for (const requestId of harness.lookupRequestIds) {
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
  });

  it('processes direct lookups one at a time', async () => {
    let active = 0;
    let maxActive = 0;
    const harness = createHarness({
      lookup: async (accessKey) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return success(`<nfe key="${accessKey}"/>`);
      },
    });

    harness.input.value = `${KEY_A}\n${KEY_B}\n${KEY_C}`;
    harness.controller.syncDraft();
    await harness.controller.start();

    expect(maxActive).toBe(1);
    expect(harness.lookups).toEqual([KEY_A, KEY_B, KEY_C]);
    expect(lastItems(harness).map((item) => item.status)).toEqual(['success', 'success', 'success']);
  });

  it('attaches the local supplier rule after parsing without making it mandatory', async () => {
    const identified = createHarness({
      resolveSupplier: async () => ({ supplierId: 'souza-cruz' }),
    });
    identified.input.value = KEY_A;
    identified.controller.syncDraft();
    await identified.controller.start();

    expect(identified.supplierResolutions).toEqual(['12345678000195']);
    expect(lastItems(identified)[0]?.parsed?.supplierRuleId).toBe('souza-cruz');
    expect(lastItems(identified)[0]?.status).toBe('success');

    const unavailable = createHarness({
      resolveSupplier: async () => {
        throw new Error('Bridge local indisponível');
      },
    });
    unavailable.input.value = KEY_A;
    unavailable.controller.syncDraft();
    await unavailable.controller.start();

    expect(lastItems(unavailable)[0]?.parsed?.supplierRuleId).toBeNull();
    expect(lastItems(unavailable)[0]?.status).toBe('success');
  });

  it('switches the rest of the batch to Portal after consumption_limit', async () => {
    const harness = createHarness({
      lookup: async (accessKey) => accessKey === KEY_A
        ? { category: 'consumption_limit', xml: null, cStat: '656', message: 'limite' }
        : success(),
    });

    harness.input.value = `${KEY_A}\n${KEY_B}\n${KEY_C}`;
    harness.controller.syncDraft();
    await harness.controller.start();

    expect(harness.lookups).toEqual([KEY_A]);
    expect(harness.portalStarts).toEqual([KEY_A, KEY_B, KEY_C]);
    expect(lastItems(harness).map((item) => item.status)).toEqual(['success', 'success', 'success']);
  });

  it('uses Portal for cStat 217 without switching later items away from SEFAZ', async () => {
    const harness = createHarness({
      lookup: async (accessKey) => accessKey === KEY_A
        ? { category: 'fiscal_status', xml: null, cStat: '217', message: 'não localizada' }
        : success(`<nfe key="${accessKey}"/>`),
    });

    harness.input.value = `${KEY_A}\n${KEY_B}`;
    harness.controller.syncDraft();
    await harness.controller.start();

    expect(harness.lookups).toEqual([KEY_A, KEY_B]);
    expect(harness.portalStarts).toEqual([KEY_A]);
    expect(lastItems(harness).map((item) => item.status)).toEqual(['success', 'success']);
  });

  it('stops remaining direct work after certificate_error', async () => {
    const harness = createHarness({
      lookup: async () => ({
        category: 'certificate_error',
        xml: null,
        cStat: null,
        message: 'Certificado indisponível',
      }),
    });

    harness.input.value = `${KEY_A}\n${KEY_B}`;
    harness.controller.syncDraft();
    await harness.controller.start();

    expect(harness.lookups).toEqual([KEY_A]);
    expect(lastItems(harness).map((item) => item.status)).toEqual(['transport_error', 'cancelled']);
  });

  it('aborts the current lookup and marks queued items cancelled', async () => {
    const harness = createHarness({
      lookup: async (_accessKey, signal) => new Promise<NfeLookupResult>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }),
    });

    harness.input.value = `${KEY_A}\n${KEY_B}`;
    harness.controller.syncDraft();
    const running = harness.controller.start();
    await Promise.resolve();
    await harness.controller.cancel();
    await running;

    expect(lastItems(harness).map((item) => item.status)).toEqual(['cancelled', 'cancelled']);
    expect(harness.controller.isBusy()).toBe(false);
  });

  it('creates ZIP and prints only successfully parsed documents', async () => {
    const harness = createHarness({
      lookup: async (accessKey) => accessKey === KEY_B
        ? { category: 'fiscal_status', xml: null, cStat: '137', message: 'sem documento' }
        : success(`<nfe key="${accessKey}"/>`),
    });

    harness.input.value = `${KEY_A}\n${KEY_B}\n${KEY_C}`;
    harness.controller.syncDraft();
    await harness.controller.start();
    harness.controller.downloadZip();
    harness.controller.printDanfes();

    expect(harness.zipEntries.map((entry) => entry.name)).toEqual([`${KEY_A}.xml`, `${KEY_C}.xml`]);
    expect(harness.downloads).toHaveLength(1);
    expect(harness.printedDocuments).toHaveLength(1);
    expect(harness.printedDocuments[0]?.map((item) => item.accessKey)).toEqual([KEY_A, KEY_C]);
    expect(harness.printCalls).toBe(1);
  });

  it('preserves the startup failure message instead of reporting a successful conclusion', async () => {
    const harness = createHarness({
      lookup: async () => {
        throw new Error('Bridge offline durante a consulta');
      },
    });

    harness.input.value = KEY_A;
    harness.controller.syncDraft();
    await harness.controller.start();

    expect(harness.route.textContent).toBe('Bridge offline durante a consulta');
    expect(lastItems(harness)[0]?.status).toBe('transport_error');
  });

  it('does not retry SEFAZ after a cancelled Portal fallback', async () => {
    const harness = createHarness({
      lookup: async () => ({
        category: 'fiscal_status',
        xml: null,
        cStat: '217',
        message: 'não localizada',
      }),
      portalWait: async (operationId) => ({
        operationId,
        state: 'cancelled',
        message: 'cancelada',
        xml: null,
      }),
    });

    harness.input.value = KEY_A;
    harness.controller.syncDraft();
    await harness.controller.start();

    expect(harness.lookups).toEqual([KEY_A]);
    expect(harness.portalStarts).toEqual([KEY_A]);
    expect(lastItems(harness)[0]?.status).toBe('portal_error');
  });
});
