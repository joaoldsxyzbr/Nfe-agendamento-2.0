import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBatchController, type BatchItemView } from '../src/batch/controller';

const A = '42260912345678000195550010000000011123456786';
const B = '35260812345678000195550010000000011000000018';
const el = <T extends object>(value: T): T => value;

function harness(overrides: Record<string, unknown> = {}) {
  const snapshots: BatchItemView[][] = [];
  const portalStarts: string[] = [];
  const input = el({ value: '', disabled: false } as HTMLTextAreaElement);
  const route = el({ textContent: '' } as HTMLElement);
  const zipButton = el({ disabled: true } as HTMLButtonElement);
  const printButton = el({ disabled: true } as HTMLButtonElement);
  const portal = {
    getInfo: async () => ({
      version: '0.2.11',
      capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
    }),
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
      zipButton,
      printButton,
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

  return { controller, input, route, zipButton, printButton, portalStarts, snapshots };
}

describe('batch controller Portal-only', () => {
  it('processes every item sequentially through the Portal', async () => {
    const h = harness();
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.portalStarts).toEqual([A, B]);
    expect(h.snapshots.at(-1)?.every((item) => item.source === 'Portal')).toBe(true);
  });

  it('serializes the preflight so double submit cannot start parallel batches', async () => {
    let resolveInfo!: (value: unknown) => void;
    let infoCalls = 0;
    const h = harness({
      getInfo: () => new Promise((resolve) => {
        infoCalls += 1;
        resolveInfo = resolve;
      }),
    });
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();

    const first = h.controller.start();
    const second = h.controller.start();

    expect(infoCalls).toBe(1);
    expect(h.controller.isBusy()).toBe(true);
    resolveInfo({
      version: '0.2.11',
      capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
    });
    await Promise.all([first, second]);

    expect(h.portalStarts).toEqual([A, B]);
  });

  it('does not start when the extension is missing', async () => {
    const h = harness({ getInfo: async () => null });
    h.input.value = `${A}\n${B}`;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.portalStarts).toHaveLength(0);
    expect(h.route.textContent).toContain('Extensão não conectada');
    expect(h.snapshots.at(-1)?.map((item) => item.status)).toEqual(['queued', 'queued']);
  });

  it('restores completed-result actions when a later preflight exits early', async () => {
    let infoCalls = 0;
    const h = harness({
      getInfo: async () => {
        infoCalls += 1;
        if (infoCalls === 1) {
          return {
            version: '0.2.11',
            capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
          };
        }
        return null;
      },
    });
    h.input.value = A;
    h.controller.syncDraft();
    await h.controller.start();

    expect(h.zipButton.disabled).toBe(false);
    expect(h.printButton.disabled).toBe(false);

    await h.controller.start();

    expect(h.zipButton.disabled).toBe(false);
    expect(h.printButton.disabled).toBe(false);
    expect(h.route.textContent).toContain('Extensão não conectada');
  });
});

describe('batch preflight action guards', () => {
  it('locks Portal retry while preflight is pending', () => {
    const source = readFileSync(new URL('../src/batch/controller.ts', import.meta.url), 'utf8');
    expect(source).toContain("item.status !== 'portal_error' || preflighting || running || manualPortalBusy");
    expect(source).toContain('retry.disabled = preflighting || running || manualPortalBusy');
    expect(source).toContain('refreshResultActions();');
  });
});
