import { describe, expect, it } from 'vitest';
import { createBatchController, type BatchItemView } from '../src/batch/controller';

const A = '42260912345678000195550010000000011123456786';
const B = '35260812345678000195550010000000011000000018';
const el = <T extends object>(value: T): T => value;

function harness(overrides: Record<string, unknown> = {}) {
  const snapshots: BatchItemView[][] = [];
  const portalStarts: string[] = [];
  const directCalls: string[] = [];
  const input = el({ value: '', disabled: false } as HTMLTextAreaElement);
  const route = el({ textContent: '' } as HTMLElement);

  const portal = {
    isAvailable: async () => true,
    directLookup: async (key: string) => {
      directCalls.push(key);
      return { category: 'success' as const, xml: '<xml />', cStat: '138', message: 'ok' };
    },
    start: async (key: string) => {
      portalStarts.push(key);
      return `op-${portalStarts.length}`;
    },
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

  return { controller, input, route, portalStarts, directCalls, snapshots };
}

describe('batch controller direct-first', () => {
  it('uses SEFAZ for successful items without opening Portal', async () => {
    const h = harness();
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.directCalls).toEqual([A, B]);
    expect(h.portalStarts).toHaveLength(0);
    expect(h.snapshots.at(-1)?.every((item) => item.source === 'SEFAZ')).toBe(true);
  });

  it('uses Portal only for a 217 item then returns to direct SEFAZ', async () => {
    let count = 0;
    const h = harness({
      directLookup: async (key: string) => {
        h.directCalls.push(key);
        count += 1;
        return count === 1
          ? { category: 'fiscal_status', xml: null, cStat: '217', message: 'não localizada' }
          : { category: 'success', xml: '<xml />', cStat: '138', message: 'ok' };
      },
    });

    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.directCalls).toEqual([A, B]);
    expect(h.portalStarts).toEqual([A]);
    expect(h.snapshots.at(-1)?.map((item) => item.source)).toEqual(['Portal', 'SEFAZ']);
  });

  it('switches remaining items to Portal after consumption limit', async () => {
    const h = harness({
      directLookup: async (key: string) => {
        h.directCalls.push(key);
        return { category: 'consumption_limit', xml: null, cStat: '656', message: 'Consumo indevido' };
      },
    });

    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.directCalls).toEqual([A]);
    expect(h.portalStarts).toEqual([A, B]);
    expect(h.snapshots.at(-1)?.every((item) => item.source === 'Portal')).toBe(true);
  });
});
