import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const repoRoot = new URL('../../../', import.meta.url);
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/batch/controller.js', import.meta.url), 'utf8');
describe('Portal-only readiness', () => {
    it('has no active Windows Bridge or direct SEFAZ frontend', () => {
        expect(existsSync(new URL('apps/ui/src/bridge', repoRoot))).toBe(false);
        const active = `${main}\n${batch}`;
        expect(active).not.toContain('127.0.0.1:17345');
        expect(active).not.toContain('BridgeClient');
        expect(active).not.toContain('directLookup');
        expect(active).not.toContain('Consultando SEFAZ');
        expect(active).toContain('Portal Nacional');
    });
    it('keeps explicit extension, Portal, cancellation and recovery states', () => {
        for (const state of [
            'Extensão não conectada',
            'Atualize a extensão',
            'Resolva o hCaptcha',
            'Lote cancelado',
            'Erro no Portal',
            'Importar XML',
        ])
            expect(`${main}\n${batch}`).toContain(state);
    });
});
