import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/batch/controller.ts', import.meta.url), 'utf8');
const single = readFileSync(new URL('../src/nfe/consultation-controller.ts', import.meta.url), 'utf8');

describe('direct SEFAZ with Portal fallback', () => {
  it('keeps extension-only architecture with direct lookup first', () => {
    expect(main).toContain('new BrowserPortalExtensionClient()');
    expect(main).not.toContain('BridgeClient');
    expect(single).toContain('deps.portal.directLookup(validation.value)');
    expect(single).toContain("lookup.category === 'consumption_limit'");
    expect(single).toContain("lookup.cStat === '217'");
    expect(batch).toContain('deps.portal.directLookup(item.accessKey, signal)');
    expect(batch).toContain("route = 'portal'");
  });

  it('keeps Portal as manual captcha fallback', () => {
    expect(single).toContain('Resolva o hCaptcha manualmente');
    expect(batch).toContain('Resolva o hCaptcha na janela do Portal.');
    expect(main).toContain('Portal Nacional só abre como fallback');
  });
});
