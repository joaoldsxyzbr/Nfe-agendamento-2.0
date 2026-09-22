import { describe, expect, it } from 'vitest';
import { createBatchController, type BatchItemView } from '../src/batch/controller';

const A = '42260912345678000195550010000000011123456786';
const B = '35260812345678000195550010000000011000000018';
const el = <T extends object>(value: T): T => value;

function harness(overrides: Record<string, unknown> = {}) {
  const snapshots: BatchItemView[][] = [];
  const directKeys: string[] = [];
  const portalStarts: string[] = [];
  const optionsOpens: string[] = [];
  const input = el({ value: '', disabled: false } as HTMLTextAreaElement);
  const route = el({ textContent: '' } as HTMLElement);
  const portal = {
    getInfo: async () => ({
      version: '0.2.6',
      capabilities: { directLookup: true, portalLookup: true, supplierResolution: true },
      configuration: { fiscalIdentityConfigured: true },
    }),
    openOptions: async () => { optionsOpens.push('opened'); },
    directLookup: async (key: string) => {
      directKeys.push(key);
      return { category: 'success' as const, xml: '<xml />', cStat: '138', message: 'ok' };
    },
    start: async (key: string) => { portalStarts.push(key); return `op-${portalStarts.length}`; },
    waitForResult: async (operationId: string) => ({
      operationId,
      state: 'completed' as const,
      message: null,
      xml: '<xml />',
    }),
    cancel: async () => {},
    resolveSupplier: async () => ({ supplierId: null }),
    ...overrides,
  };
  const controller = createBatchController({
    elements: {
      keysInput: input,
      inputSummary: el({ textContent: '' } as HTMLElement),
      startButton: el({ disabled: false } as HTMLButtonElement),
      cancelButton: el({ hidden: true } as HTMLButtonElement),
      zipButton: el({ disabled: true } as HTMLButtonElement),
      printButton: el({ disabled: true } as HTMLButtonElement),
      progress: el({ textContent: '' } as HTMLElement),
      routeText: route,
      modeSingleButton: el({ disabled: false } as HTMLButtonElement),
      modeBatchButton: el({ disabled: false } as HTMLButtonElement),
    },
    portal: portal as never,
    parseXml: (xml, accessKey) => ({
      accessKey,
      originalXml: xml,
      issuer: { taxId: '12345678000195', name: 'Emitente' },
      totals: { invoice: 10 },
      number: '1',
      series: '1',
    } as never),
    createZip: () => new Blob(),
    downloadBlob: () => {},
    openDanfe: () => {},
    downloadXml: () => {},
    openDanfeDocuments: () => {},
    printWindow: () => {},
    renderRows: (items) => snapshots.push(items.map((item) => ({ ...item }))),
  });
  return { controller, input, route, directKeys, portalStarts, optionsOpens, snapshots };
}

describe('batch controller direct-first', () => {
  it('uses direct SEFAZ for each item when XML is available', async () => {
    const h = harness();
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.directKeys).toEqual([A, B]);
    expect(h.portalStarts).toHaveLength(0);
    expect(h.snapshots.at(-1)?.every((item) => item.source === 'SEFAZ')).toBe(true);
  });

  it('sends only the 217 item to the Portal and returns to direct lookup', async () => {
    let calls = 0;
    const h = harness({
      directLookup: async (key: string) => {
        h.directKeys.push(key);
        calls += 1;
        return calls === 1
          ? { category: 'fiscal_status', xml: null, cStat: '217', message: 'não consta' }
          : { category: 'success', xml: '<xml />', cStat: '138', message: 'ok' };
      },
    });
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.portalStarts).toEqual([A]);
    expect(h.directKeys).toEqual([A, B]);
    expect(h.snapshots.at(-1)?.map((item) => item.source)).toEqual(['Portal', 'SEFAZ']);
  });

  it('switches remaining items to Portal after consumption limit', async () => {
    const h = harness({
      directLookup: async (key: string) => {
        h.directKeys.push(key);
        return { category: 'consumption_limit', xml: null, cStat: '656', message: 'limite' };
      },
    });
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.directKeys).toEqual([A]);
    expect(h.portalStarts).toEqual([A, B]);
    expect(h.snapshots.at(-1)?.every((item) => item.source === 'Portal')).toBe(true);
  });

  it('does not start or cancel the batch when fiscal configuration is missing', async () => {
    const h = harness({
      getInfo: async () => ({
        version: '0.2.8',
        capabilities: { directLookup: true, portalLookup: true, supplierResolution: true },
        configuration: { fiscalIdentityConfigured: false },
      }),
    });
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.directKeys).toHaveLength(0);
    expect(h.portalStarts).toHaveLength(0);
    expect(h.optionsOpens).toEqual(['opened']);
    expect(h.snapshots.at(-1)?.map((item) => item.status)).toEqual(['queued', 'queued']);
    expect(h.route.textContent).toContain('Configure o CNPJ');
  });
});
