import { describe, expect, it } from 'vitest';
import { createConsultationController } from '../src/nfe/consultation-controller';

const KEY = '42260912345678000195550010000000011123456786';

function harness(overrides: Record<string, unknown> = {}) {
  const states: Array<[string, string]> = [];
  const successes: any[] = [];
  const directKeys: string[] = [];
  const portalStarts: string[] = [];
  const optionsOpens: string[] = [];
  const portal = {
    getInfo: async () => ({
      version: '0.2.6',
      capabilities: { directLookup: true, openOptions: true, portalLookup: true, supplierResolution: true },
      configuration: { fiscalIdentityConfigured: true },
    }),
    openOptions: async () => { optionsOpens.push('opened'); },
    directLookup: async (accessKey: string) => {
      directKeys.push(accessKey);
      return { category: 'success' as const, xml: '<xml />', cStat: '138', message: 'ok' };
    },
    start: async (accessKey: string) => { portalStarts.push(accessKey); return 'op-1'; },
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
    parseXml: (xml, accessKey) => ({ accessKey, originalXml: xml, issuer: { taxId: '12345678000195' } } as never),
    renderState: (title, message) => states.push([title, message]),
    renderPortalFailure: (title, message) => states.push([title, message]),
    renderSuccess: (parsed) => successes.push(parsed),
    renderInvalidXml: () => {},
    setBusy: () => {},
    focusInput: () => {},
    resetView: () => {},
  });
  return { controller, states, successes, directKeys, portalStarts, optionsOpens };
}

describe('consultation controller direct-first', () => {
  it('finishes from the direct SEFAZ lookup without opening the Portal', async () => {
    const h = harness();
    await h.controller.submit();
    expect(h.directKeys).toEqual([KEY]);
    expect(h.portalStarts).toHaveLength(0);
    expect(h.successes).toHaveLength(1);
  });

  it('uses Portal only for cStat 217', async () => {
    const h = harness({
      directLookup: async () => ({ category: 'fiscal_status', xml: null, cStat: '217', message: 'não consta' }),
    });
    await h.controller.submit();
    expect(h.portalStarts).toEqual([KEY]);
    expect(h.states.some(([title]) => title === 'Portal Nacional aberto')).toBe(true);
  });

  it('uses Portal when the fiscal usage guard is active', async () => {
    const h = harness({
      directLookup: async () => ({ category: 'consumption_limit', xml: null, cStat: '656', message: 'consumo indevido' }),
    });
    await h.controller.submit();
    expect(h.portalStarts).toEqual([KEY]);
  });

  it('opens configuration before any lookup when the fiscal identity is missing', async () => {
    const h = harness({
      getInfo: async () => ({
        version: '0.2.8',
        capabilities: { directLookup: true, openOptions: true, portalLookup: true, supplierResolution: true },
        configuration: { fiscalIdentityConfigured: false },
      }),
    });
    await h.controller.submit();

    expect(h.directKeys).toHaveLength(0);
    expect(h.portalStarts).toHaveLength(0);
    expect(h.optionsOpens).toEqual(['opened']);
    expect(h.states.at(-1)?.[0]).toBe('Configure o CNPJ do A1');
    expect(h.states.at(-1)?.[1]).toContain('Nenhuma consulta foi enviada à SEFAZ');
  });

  it('asks for an extension update when automatic options are unavailable', async () => {
    const h = harness({
      getInfo: async () => ({
        version: '0.2.7',
        capabilities: { directLookup: true, openOptions: false, portalLookup: true, supplierResolution: true },
        configuration: { fiscalIdentityConfigured: false },
      }),
    });
    await h.controller.submit();

    expect(h.directKeys).toHaveLength(0);
    expect(h.optionsOpens).toHaveLength(0);
    expect(h.states.at(-1)?.[0]).toBe('Atualize a extensão');
    expect(h.states.at(-1)?.[1]).toContain('extensão é anterior');
  });

  it('still handles a late configuration error without falling back to Portal', async () => {
    const h = harness({
      directLookup: async () => ({ category: 'configuration_error', xml: null, cStat: null, message: 'Configure o CNPJ.' }),
    });
    await h.controller.submit();
    expect(h.portalStarts).toHaveLength(0);
    expect(h.states.at(-1)?.[0]).toBe('Configuração necessária');
  });

  it('requires the new extension capability before consulting', async () => {
    const h = harness({
      getInfo: async () => ({
        version: '0.2.5',
        capabilities: { directLookup: false, openOptions: false, portalLookup: true, supplierResolution: true },
        configuration: { fiscalIdentityConfigured: false },
      }),
    });
    await h.controller.submit();
    expect(h.directKeys).toHaveLength(0);
    expect(h.states.at(-1)?.[0]).toBe('Atualize a extensão');
  });
});
