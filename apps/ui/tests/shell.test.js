import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const fromWeb = (path) => new URL(`../${path}`, import.meta.url);
describe('application shell', () => {
    it('ships only the site + extension Portal runtime', () => {
        for (const path of [
            'index.html',
            'src/main.js',
            'src/portal/extension-client.js',
            'src/portal/contracts.js',
            'src/batch/controller.js',
            'src/nfe/manual-xml-import.js',
            'src/danfe/viewer.js',
        ])
            expect(existsSync(fromWeb(path)), path).toBe(true);
        expect(existsSync(fromWeb('src/bridge'))).toBe(false);
        expect(existsSync(fromWeb('src/portal/fallback.js'))).toBe(false);
        const main = readFileSync(fromWeb('src/main.js'), 'utf8');
        expect(main).toContain('Extensão conectada');
        expect(main).toContain('Portal Nacional');
        expect(main).not.toContain('Bridge');
        expect(main).not.toContain('Consulta direta');
        expect(main).not.toContain('SEFAZ');
        expect(main).not.toContain('certificate-select');
    });
    it('keeps one unified consultation UI with DANFE/XML and recovery actions', () => {
        const main = readFileSync(fromWeb('src/main.js'), 'utf8');
        const batch = readFileSync(fromWeb('src/batch/controller.js'), 'utf8');
        expect(main).toContain('id="batch-keys"');
        expect(main).toContain('id="batch-key-count"');
        expect(main).toContain('rows="1"');
        expect(main).toContain('id="batch-run-toolbar" hidden');
        expect(main).toContain('id="batch-list" class="batch-list" aria-live="polite" hidden');
        expect(main).toContain('id="batch-start"');
        expect(main).toContain('id="batch-reset"');
        expect(main).toContain("actionIconMarkup('new')");
        expect(main).toContain("actionIconMarkup('consult')");
        expect(batch).toContain("actionIconMarkup('view')");
        expect(batch).toContain("actionIconMarkup('print')");
        expect(batch).toContain("actionIconMarkup('download')");
        expect(main).not.toContain('id="mode-single"');
        expect(main).not.toContain('id="mode-batch"');
        expect(batch).toContain('Visualizar DANFE');
        expect(batch).toContain("preview.textContent = 'Visualizar'");
        expect(batch).toContain("download.textContent = 'XML'");
        expect(batch).toContain("information.append(details, key);");
        expect(batch).toContain("print.textContent = 'Imprimir'");
        expect(batch).toContain('row.preview.hidden = item.parsed === null');
        expect(batch).toContain('elements.list.hidden = !hasRun');
        expect(batch).toContain('Baixar XML');
        expect(batch).toContain('Importar XML');
        expect(main).toContain('Baixar XMLs (.zip)');
        expect(main).toContain('Imprimir DANFEs');
    });
});
