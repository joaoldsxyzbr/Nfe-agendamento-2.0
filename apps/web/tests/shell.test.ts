import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const fromWeb = (path: string) => new URL(`../${path}`, import.meta.url);
describe('application shell', () => {
  it('ships only the site + extension runtime', () => {
    for (const path of ['index.html','src/main.ts','src/portal/extension-client.ts','src/portal/contracts.ts','src/nfe/consultation-controller.ts','src/batch/controller.ts','src/danfe/viewer.ts']) expect(existsSync(fromWeb(path)), path).toBe(true);
    expect(existsSync(fromWeb('src/bridge'))).toBe(false);
    expect(existsSync(fromWeb('src/portal/fallback.ts'))).toBe(false);
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');
    expect(main).toContain('Extensão conectada'); expect(main).toContain('Portal Nacional');
    expect(main).not.toContain('Bridge'); expect(main).not.toContain('SEFAZ'); expect(main).not.toContain('certificate-select');
  });
  it('keeps DANFE/XML actions and batch UI', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');
    expect(main).toContain('Visualizar DANFE'); expect(main).toContain('Baixar XML'); expect(main).toContain('Baixar XMLs (.zip)'); expect(main).toContain('Imprimir DANFEs'); expect(main).toContain('id="mode-batch"');
  });
});
