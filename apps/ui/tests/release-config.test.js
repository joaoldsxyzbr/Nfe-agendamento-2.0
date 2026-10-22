import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
const releaseUrl = new URL('../../../.github/workflows/release.yml', import.meta.url);
const ciUrl = new URL('../../../.github/workflows/ci.yml', import.meta.url);
describe('release quality gate', () => {
    it('validates all areas without consuming Actions artifact storage', async () => {
        const ci = await readFile(ciUrl, 'utf8');
        expect(ci).toContain('npm audit --audit-level=high');
        expect(ci).toContain('npm run build:extension');
        expect(ci).toContain('npm test --prefix tests/playwright');
        expect(ci).toContain('actions/upload-artifact@');
        expect(ci).toContain('path: apps/extension/dist/');
        expect(ci).toContain('retention-days: 7');
    });
    it('publishes normal releases after CI while keeping physical acceptance traceable', async () => {
        const release = await readFile(releaseUrl, 'utf8');
        expect(release).toContain('docs/testing/acceptance-results/v${version}.md');
        expect(release).toContain('Release: v${version}');
        expect(release).toContain('Extension: ${extension_version}');
        expect(release).toContain("^Status: (PENDENTE|APROVADO)$");
        expect(release).toContain("^Chrome: (NÃO EXECUTADO|APROVADO)$");
        expect(release).toContain("^Edge: (NÃO EXECUTADO|APROVADO)$");
        expect(release).not.toContain('--prerelease');
        expect(release).not.toContain('--latest=false');
        expect(release).not.toContain('Status: APROVADO');
        expect(release).not.toContain('Chrome: APROVADO');
        expect(release).not.toContain('Edge: APROVADO');
        expect(release).toContain('- name: Rebuild extension from the CI-approved commit');
        expect(release).toContain('npm run build:extension');
        expect(release).toContain('zip -q -r ../../../release/extension/NFeAgendamento-Extension-MV3.zip .');
        expect(release).not.toContain('download-artifact@');
    });
});
