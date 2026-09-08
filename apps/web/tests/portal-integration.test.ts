import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

describe('portal fallback integration', () => {
  it('uses Portal only after a consumption limit and reuses the validated XML pipeline', () => {
    expect(main).toContain("import { PortalFallbackController } from './portal/fallback';");
    expect(main).toContain('new PortalFallbackController()');

    const limitIndex = main.indexOf("lookup.category === 'consumption_limit'");
    const startIndex = main.indexOf('portalFallback.start(', limitIndex);
    const waitIndex = main.indexOf('portalFallback.waitForResult(', startIndex);
    const parseIndex = main.indexOf('parseNfeXml(portalStatus.xml', waitIndex);
    const successIndex = main.indexOf('renderLookupSuccess(parsed)', parseIndex);

    expect(limitIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(limitIndex);
    expect(waitIndex).toBeGreaterThan(startIndex);
    expect(parseIndex).toBeGreaterThan(waitIndex);
    expect(successIndex).toBeGreaterThan(parseIndex);
    expect(main.match(/lookupNfe\(/g)).toHaveLength(1);
  });

  it('keeps captcha manual and reports cancelled/failed Portal operations', () => {
    expect(main).toContain('Resolva o hCaptcha manualmente');
    expect(main).toContain("portalStatus.state === 'cancelled'");
    expect(main).toContain("portalStatus.state === 'failed'");
  });
});
