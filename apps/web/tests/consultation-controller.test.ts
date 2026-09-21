import { describe, expect, it } from 'vitest';
import type { NfeLookupResult, PortalOperationStatus, SupplierResolution } from '../src/bridge/contracts';
import type { ParsedNfe } from '../src/nfe/xml';
import { createConsultationController, type ConsultationControllerDependencies } from '../src/nfe/consultation-controller';

const KEY = '42260812345678000123550010000012341000012342';

function parsed(xml = '<nfe/>'): ParsedNfe {
  return {
    accessKey: KEY,
    originalXml: xml,
    supplierRuleId: null,
    issuer: { name: 'Emitente teste', taxId: '12345678000195' },
  } as ParsedNfe;
}

function success(xml = '<nfe/>'): NfeLookupResult {
  return { category: 'success', xml, cStat: '138', message: null };
}

function createHarness(options: {
  validation?: { valid: true; value: string; ufAutor: string } | { valid: false; error: string };
  lookup?: () => Promise<NfeLookupResult>;
  resolveSupplier?: () => Promise<SupplierResolution>;
  parseXml?: () => ParsedNfe;
  portalStart?: () => Promise<string>;
  portalWait?: () => Promise<PortalOperationStatus>;
  portalCancel?: (operationId: string) => Promise<void>;
} = {}) {
  let input = KEY;
  const states: Array<{ title: string; message: string }> = [];
  const failures: NfeLookupResult[] = [];
  const portalRecoveries: Array<{ title: string; message: string; accessKey: string }> = [];
  const successes: ParsedNfe[] = [];
  const invalidXml: unknown[] = [];
  const busy: boolean[] = [];
  const portalStarts: string[] = [];
  const portalCancels: string[] = [];
  let focusCalls = 0;
  let resetCalls = 0;
  let lookupCalls = 0;
  let parseCalls = 0;

  const deps: ConsultationControllerDependencies = {
    getAccessKey: () => input,
    clearAccessKey: () => { input = ''; },
    validateAccessKey: () => options.validation ?? { valid: true, value: KEY, ufAutor: '42' },
    bridge: {
      lookupNfe: async () => {
        lookupCalls += 1;
        return options.lookup?.() ?? success();
      },
      resolveSupplier: async () => options.resolveSupplier?.() ?? { supplierId: null },
    },
    portal: {
      start: async () => {
        portalStarts.push(KEY);
        return options.portalStart?.() ?? 'op-1';
      },
      waitForResult: async () => options.portalWait?.() ?? {
        operationId: 'op-1',
        state: 'completed',
        message: null,
        xml: '<portal/>',
      },
      cancel: async (operationId) => {
        portalCancels.push(operationId);
        await options.portalCancel?.(operationId);
      },
    },
    parseXml: (xml) => {
      parseCalls += 1;
      return options.parseXml?.() ?? parsed(xml);
    },
    renderState: (title, message) => states.push({ title, message }),
    renderFailure: (lookup) => failures.push(lookup),
    renderPortalFailure: (title, message, accessKey) => portalRecoveries.push({ title, message, accessKey }),
    renderSuccess: (value) => successes.push(value),
    renderInvalidXml: (error) => invalidXml.push(error),
    setBusy: (value) => busy.push(value),
    focusInput: () => { focusCalls += 1; },
    resetView: () => { resetCalls += 1; },
  };

  const controller = createConsultationController(deps);

  return {
    controller,
    states,
    failures,
    portalRecoveries,
    successes,
    invalidXml,
    busy,
    portalStarts,
    portalCancels,
    get focusCalls() { return focusCalls; },
    get resetCalls() { return resetCalls; },
    get lookupCalls() { return lookupCalls; },
    get parseCalls() { return parseCalls; },
    get input() { return input; },
  };
}

describe('single consultation controller', () => {
  it('rejects invalid keys before Bridge access', async () => {
    const harness = createHarness({
      validation: { valid: false, error: 'chave inválida' },
    });

    await harness.controller.submit();

    expect(harness.lookupCalls).toBe(0);
    expect(harness.states.at(-1)).toEqual({ title: 'Chave inválida', message: 'chave inválida' });
    expect(harness.focusCalls).toBe(1);
  });

  it('parses successful XML, resolves supplier fail-soft and renders success', async () => {
    const harness = createHarness({
      resolveSupplier: async () => ({ supplierId: 'souza-cruz' }),
    });

    await harness.controller.submit();

    expect(harness.lookupCalls).toBe(1);
    expect(harness.parseCalls).toBe(1);
    expect(harness.successes).toHaveLength(1);
    expect(harness.successes[0]?.supplierRuleId).toBe('souza-cruz');
    expect(harness.busy).toEqual([true, false]);
  });

  it('applies supplier resolution to a validated manually imported XML', async () => {
    const harness = createHarness({
      resolveSupplier: async () => ({ supplierId: 'fernando-klein' }),
    });

    await harness.controller.completeManualImport(parsed('<manual/>'));

    expect(harness.successes).toHaveLength(1);
    expect(harness.successes[0]?.supplierRuleId).toBe('fernando-klein');
  });

  it('renders invalid XML without exposing success', async () => {
    const error = new Error('xml inválido');
    const harness = createHarness({
      parseXml: () => { throw error; },
    });

    await harness.controller.submit();

    expect(harness.invalidXml).toEqual([error]);
    expect(harness.successes).toHaveLength(0);
    expect(harness.busy.at(-1)).toBe(false);
  });

  it('opens Portal only for consumption_limit and cStat 217', async () => {
    const limited = createHarness({
      lookup: async () => ({ category: 'consumption_limit', xml: null, cStat: '656', message: 'limite' }),
    });
    await limited.controller.submit();
    expect(limited.portalStarts).toEqual([KEY]);
    expect(limited.successes).toHaveLength(1);

    const missing = createHarness({
      lookup: async () => ({ category: 'fiscal_status', xml: null, cStat: '217', message: 'não localizada' }),
    });
    await missing.controller.submit();
    expect(missing.portalStarts).toEqual([KEY]);

    const other = createHarness({
      lookup: async () => ({ category: 'fiscal_status', xml: null, cStat: '137', message: 'sem XML' }),
    });
    await other.controller.submit();
    expect(other.portalStarts).toHaveLength(0);
    expect(other.failures).toHaveLength(1);
  });

  it('keeps busy state balanced when Bridge throws', async () => {
    const harness = createHarness({
      lookup: async () => { throw new Error('falha bridge'); },
    });

    await harness.controller.submit();

    expect(harness.states.at(-1)).toEqual({
      title: 'Consulta não concluída',
      message: 'falha bridge',
    });
    expect(harness.busy).toEqual([true, false]);
  });

  it('renders cancelled and failed Portal terminal states without fiscal retry', async () => {
    const cancelled = createHarness({
      lookup: async () => ({ category: 'fiscal_status', xml: null, cStat: '217', message: 'não localizada' }),
      portalWait: async () => ({ operationId: 'op-1', state: 'cancelled', message: 'fechada', xml: null }),
    });
    await cancelled.controller.submit();
    expect(cancelled.lookupCalls).toBe(1);
    expect(cancelled.states.at(-1)?.title).toBe('Consulta pelo Portal cancelada');

    const failed = createHarness({
      lookup: async () => ({ category: 'fiscal_status', xml: null, cStat: '217', message: 'não localizada' }),
      portalWait: async () => ({ operationId: 'op-1', state: 'failed', message: 'indisponível', xml: null }),
    });
    await failed.controller.submit();
    expect(failed.lookupCalls).toBe(1);
    expect(failed.portalRecoveries.at(-1)).toEqual({
      title: 'Portal da NF-e indisponível',
      message: 'indisponível',
      accessKey: KEY,
    });
  });

  it('resets the visible consultation and focuses the key input', () => {
    const harness = createHarness();

    harness.controller.reset();

    expect(harness.input).toBe('');
    expect(harness.resetCalls).toBe(1);
    expect(harness.focusCalls).toBe(1);
  });

  it('cancels an active Portal operation best-effort and clears ownership', async () => {
    let release!: (value: PortalOperationStatus) => void;
    const wait = new Promise<PortalOperationStatus>((resolve) => { release = resolve; });
    const harness = createHarness({
      lookup: async () => ({ category: 'fiscal_status', xml: null, cStat: '217', message: 'não localizada' }),
      portalWait: async () => wait,
    });

    const running = harness.controller.submit();
    for (let attempt = 0; attempt < 8 && !harness.controller.isPortalActive(); attempt += 1) {
      await Promise.resolve();
    }

    expect(harness.controller.isPortalActive()).toBe(true);
    await harness.controller.cancelActivePortal();
    expect(harness.portalCancels).toEqual(['op-1']);
    expect(harness.controller.isPortalActive()).toBe(false);

    release({ operationId: 'op-1', state: 'cancelled', message: 'cancelada', xml: null });
    await running;
    expect(harness.lookupCalls).toBe(1);
  });
});
