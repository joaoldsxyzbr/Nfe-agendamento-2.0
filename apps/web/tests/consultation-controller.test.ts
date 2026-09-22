import { describe, expect, it } from 'vitest';
import { createConsultationController } from '../src/nfe/consultation-controller';
const KEY = '42260912345678000195550010000000011123456786';

function createHarness(overrides: Record<string, unknown> = {}) {
  const states: Array<[string, string]> = [];
  const successes: any[] = [];
  const portalStarts: string[] = [];
  const portal = {
    isAvailable: async () => true,
    start: async (accessKey: string) => { portalStarts.push(accessKey); return 'op-1'; },
    waitForResult: async (operationId: string) => ({ operationId, state: 'completed' as const, message: null, xml: '<xml />' }),
    cancel: async () => {},
    resolveSupplier: async () => ({ supplierId: null }),
    ...overrides,
  };
  const controller = createConsultationController({
    getAccessKey: () => KEY,
    clearAccessKey: () => {},
    validateAccessKey: () => ({ valid: true as const, value: KEY }),
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

describe('consultation controller extension-only', () => {
  it('consults exclusively through the browser extension', async () => {
    const h = createHarness();
    await h.controller.submit();
    expect(h.portalStarts).toEqual([KEY]);
    expect(h.successes).toHaveLength(1);
    expect(h.states.some(([title]) => title === 'Portal Nacional aberto')).toBe(true);
  });
  it('fails clearly when the extension is unavailable', async () => {
    const h = createHarness({ isAvailable: async () => false });
    await h.controller.submit();
    expect(h.portalStarts).toHaveLength(0);
    expect(h.states.at(-1)?.[0]).toBe('Extensão não conectada');
  });
  it('keeps supplier resolution fail-soft', async () => {
    const h = createHarness({ resolveSupplier: async () => { throw new Error('sem configuração'); } });
    await h.controller.submit();
    expect(h.successes[0]?.supplierRuleId).toBeNull();
  });
  it('reports cancelled Portal operations without another route', async () => {
    const h = createHarness({ waitForResult: async (operationId: string) => ({ operationId, state: 'cancelled' as const, message: 'cancelada', xml: null }) });
    await h.controller.submit();
    expect(h.states.at(-1)?.[0]).toBe('Consulta pelo Portal cancelada');
    expect(h.portalStarts).toEqual([KEY]);
  });
});
