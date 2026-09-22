import { describe, expect, it } from 'vitest';
import { createConsultationController } from '../src/nfe/consultation-controller';

const KEY = '42260912345678000195550010000000011123456786';

function createHarness(overrides: Record<string, unknown> = {}) {
  const states: Array<[string, string]> = [];
  const successes: any[] = [];
  const portalStarts: string[] = [];
  const directCalls: string[] = [];
  const failures: any[] = [];

  const portal = {
    isAvailable: async () => true,
    directLookup: async (key: string) => {
      directCalls.push(key);
      return { category: 'success' as const, xml: '<xml />', cStat: '138', message: 'ok' };
    },
    start: async (key: string) => {
      portalStarts.push(key);
      return 'op-1';
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

  const controller = createConsultationController({
    getAccessKey: () => KEY,
    clearAccessKey: () => {},
    validateAccessKey: () => ({ valid: true as const, value: KEY, ufAutor: '42' }),
    portal: portal as never,
    parseXml: (xml, accessKey) => ({
      accessKey,
      originalXml: xml,
      issuer: { taxId: '12345678000195' },
    } as never),
    renderState: (title, message) => states.push([title, message]),
    renderDirectFailure: (lookup) => failures.push(lookup),
    renderPortalFailure: (title, message) => states.push([title, message]),
    renderSuccess: (parsed) => successes.push(parsed),
    renderInvalidXml: () => {},
    setBusy: () => {},
    focusInput: () => {},
    resetView: () => {},
  });

  return { controller, states, successes, portalStarts, directCalls, failures };
}

describe('consultation controller direct-first', () => {
  it('finishes from direct SEFAZ without opening Portal', async () => {
    const h = createHarness();
    await h.controller.submit();

    expect(h.directCalls).toEqual([KEY]);
    expect(h.portalStarts).toHaveLength(0);
    expect(h.successes).toHaveLength(1);
  });

  it('falls back to Portal only for cStat 217', async () => {
    const h = createHarness({
      directLookup: async () => ({
        category: 'fiscal_status',
        xml: null,
        cStat: '217',
        message: 'NF-e não consta',
      }),
    });
    await h.controller.submit();

    expect(h.portalStarts).toEqual([KEY]);
    expect(h.successes).toHaveLength(1);
  });

  it('falls back to Portal on consumption limit', async () => {
    const h = createHarness({
      directLookup: async () => ({
        category: 'consumption_limit',
        xml: null,
        cStat: '656',
        message: 'Consumo indevido',
      }),
    });
    await h.controller.submit();

    expect(h.portalStarts).toEqual([KEY]);
  });

  it('does not use Portal for certificate or transport errors', async () => {
    const h = createHarness({
      directLookup: async () => ({
        category: 'certificate_error',
        xml: null,
        cStat: null,
        message: 'Configure o CNPJ',
      }),
    });
    await h.controller.submit();

    expect(h.portalStarts).toHaveLength(0);
    expect(h.failures).toHaveLength(1);
  });
});
