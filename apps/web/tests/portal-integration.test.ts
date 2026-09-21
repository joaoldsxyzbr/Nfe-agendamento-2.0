import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const batchController = readFileSync(new URL('../src/batch/controller.ts', import.meta.url), 'utf8');
const consultationController = readFileSync(new URL('../src/nfe/consultation-controller.ts', import.meta.url), 'utf8');

describe('portal fallback integration', () => {
  it('uses Portal after a consumption limit or SEFAZ 217 and reuses the validated XML pipeline', () => {
    expect(main).toContain("import { PortalFallbackController } from './portal/fallback';");
    expect(main).toContain('new PortalFallbackController(bridgeClient)');
    expect(main).toContain('.then((health) => portalFallback.prewarm(health))');

    const limitIndex = consultationController.indexOf("lookup.category === 'consumption_limit'");
    const status217Index = consultationController.indexOf("lookup.category === 'fiscal_status' && lookup.cStat === '217'");
    const startIndex = consultationController.indexOf('deps.portal.start(', limitIndex);
    const waitIndex = consultationController.indexOf('deps.portal.waitForResult(', startIndex);
    const parseIndex = consultationController.indexOf('renderParsedXml(portalStatus.xml', waitIndex);
    const successIndex = consultationController.indexOf('deps.renderSuccess(parsed)', parseIndex);

    expect(limitIndex).toBeGreaterThan(-1);
    expect(status217Index).toBeGreaterThan(limitIndex);
    expect(startIndex).toBeGreaterThan(status217Index);
    expect(waitIndex).toBeGreaterThan(startIndex);
    expect(parseIndex).toBeGreaterThan(waitIndex);
    expect(successIndex).toBeGreaterThan(parseIndex);

    const singleFallback = consultationController.slice(
      consultationController.indexOf('async function runPortalFallback'),
      consultationController.indexOf('async function renderParsedXml'),
    );
    expect(singleFallback).not.toContain('lookupNfe(');
    expect(consultationController).toContain('const lookup = await deps.bridge.lookupNfe(validation.value);');

    expect(batchController).toContain('deps.bridge.lookupNfe(item.accessKey, signal)');
    expect(batchController).toContain("lookup.category === 'consumption_limit'");
    expect(batchController).toContain("lookup.category === 'fiscal_status' && lookup.cStat === '217'");
    expect(batchController).toContain('deps.portal.start(item.accessKey, signal)');
    expect(batchController).toContain('deps.portal.waitForResult(operationId, signal)');
    expect(batchController).toContain("await completeItem(item, portalStatus.xml, 'Portal', signal)");
  });

  it('keeps captcha manual and reports cancelled/failed Portal operations', () => {
    expect(consultationController).toContain('Resolva o hCaptcha manualmente');
    expect(consultationController).toContain("portalStatus.state === 'cancelled'");
    expect(consultationController).toContain("portalStatus.state === 'failed'");
    expect(batchController).toContain('Resolva o hCaptcha na janela do Portal.');
  });

  it('cancels active Portal operations when the page or batch is abandoned', () => {
    expect(consultationController).toContain('let activePortalOperationId: string | null = null;');
    expect(main).toContain("window.addEventListener('pagehide'");
    expect(main).toContain('void consultationController.cancelActivePortal()');
    expect(consultationController).toContain('const operationId = activePortalOperationId;');
    expect(consultationController).toContain('await deps.portal.cancel(operationId)');
    expect(consultationController).toContain('activePortalOperationId = operationId;');
    expect(consultationController).toContain('activePortalOperationId = null;');

    expect(batchController).toContain('let activePortalOperationId: string | null = null;');
    expect(batchController).toContain('void deps.portal.cancel(operationId).catch(() => {');
  });
});
