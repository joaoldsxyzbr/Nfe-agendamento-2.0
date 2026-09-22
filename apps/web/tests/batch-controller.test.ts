import { describe, expect, it } from 'vitest';
import { createBatchController, type BatchItemView } from '../src/batch/controller';
const A = '42260912345678000195550010000000011123456786';
const B = '42260912345678000195550010000000021123456781';
const el = <T extends object>(value: T): T => value;

function harness(overrides: Record<string, unknown> = {}) {
  const snapshots: BatchItemView[][] = [];
  const starts: string[] = [];
  let active = 0;
  let maxActive = 0;
  const input = el({ value: '', disabled: false } as HTMLTextAreaElement);
  const route = el({ textContent: '' } as HTMLElement);
  const portal = {
    isAvailable: async () => true,
    start: async (key: string) => { starts.push(key); return `op-${starts.length}`; },
    waitForResult: async (operationId: string) => {
      active += 1; maxActive = Math.max(maxActive, active); await Promise.resolve(); active -= 1;
      return { operationId, state: 'completed' as const, message: null, xml: '<xml />' };
    },
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
    parseXml: (xml, accessKey) => ({ accessKey, originalXml: xml, issuer: { taxId: '12345678000195', name: 'Emitente' }, totals: { invoice: 10 }, number: '1', series: '1' } as never),
    createZip: () => new Blob(), downloadBlob: () => {}, openDanfe: () => {}, downloadXml: () => {},
    openDanfeDocuments: () => {}, printWindow: () => {},
    renderRows: (items) => snapshots.push(items.map((item) => ({ ...item }))),
  });
  return { controller, input, route, starts, snapshots, get maxActive(){ return maxActive; } };
}

describe('batch controller extension-only', () => {
  it('processes Portal operations strictly one at a time', async () => {
    const h = harness(); h.input.value = `${A}\n${B}`; h.controller.syncDraft(); await h.controller.start();
    expect(h.starts).toEqual([A, B]); expect(h.maxActive).toBe(1);
    expect(h.snapshots.at(-1)?.map((item) => item.status)).toEqual(['success', 'success']);
    expect(h.snapshots.at(-1)?.every((item) => item.source === 'Portal')).toBe(true);
  });
  it('blocks the batch before the first popup when the extension is missing', async () => {
    const h = harness({ isAvailable: async () => false }); h.input.value = A; h.controller.syncDraft(); await h.controller.start();
    expect(h.starts).toHaveLength(0); expect(h.route.textContent).toContain('Extensão não conectada');
  });
  it('keeps supplier rules fail-soft', async () => {
    const h = harness({ resolveSupplier: async () => { throw new Error('sem regra'); } }); h.input.value = A; h.controller.syncDraft(); await h.controller.start();
    expect(h.snapshots.at(-1)?.[0]?.status).toBe('success'); expect(h.snapshots.at(-1)?.[0]?.parsed?.supplierRuleId).toBeNull();
  });
});
