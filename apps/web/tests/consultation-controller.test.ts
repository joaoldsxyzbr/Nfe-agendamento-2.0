import { describe, expect, it } from 'vitest';
import { createConsultationController } from '../src/nfe/consultation-controller';

const KEY = '42260912345678000195550010000000011123456786';

function harness(overrides: Record<string, unknown> = {}) {
  const states: Array<[string, string]> = [];
  const successes: any[] = [];
  const portalStarts: string[] = [];
  const portal = {
    getInfo: async () => ({
      version: '0.2.11',
      capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
    }),
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
  return { controller, states, successes, portalStarts };
}

describe('consultation controller Portal-only', () => {
  it('opens the Portal directly for a valid key', async () => {
    const h = harness();
    await h.controller.submit();
    expect(h.portalStarts).toEqual([KEY]);
    expect(h.states.some(([title]) => title === 'Portal Nacional aberto')).toBe(true);
    expect(h.successes).toHaveLength(1);
  });

  it('does not start when the extension is missing', async () => {
    const h = harness({ getInfo: async () => null });
    await h.controller.submit();
    expect(h.portalStarts).toHaveLength(0);
    expect(h.states.at(-1)?.[0]).toBe('Extensão não conectada');
  });

  it('requires Portal support from the extension', async () => {
    const h = harness({
      getInfo: async () => ({
        version: '0.1.0',
        capabilities: { openOptions: false, portalLookup: false, supplierResolution: true },
      }),
    });
    await h.controller.submit();
    expect(h.portalStarts).toHaveLength(0);
    expect(h.states.at(-1)?.[0]).toBe('Atualize a extensão');
  });

  it('reports cancellation from the Portal', async () => {
    const h = harness({
      waitForResult: async (operationId: string) => ({
        operationId,
        state: 'cancelled' as const,
        message: 'janela fechada',
        xml: null,
      }),
    });
    await h.controller.submit();
    expect(h.states.at(-1)?.[0]).toBe('Consulta pelo Portal cancelada');
  });
});
