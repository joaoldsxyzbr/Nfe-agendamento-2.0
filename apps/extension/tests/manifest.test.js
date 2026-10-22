import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const manifestUrl = new URL('../manifest.json', import.meta.url);
describe('extension manifest', () => {
    it('uses Manifest V3 with only the Portal host and required permissions', () => {
        expect(existsSync(manifestUrl)).toBe(true);
        if (!existsSync(manifestUrl))
            return;
        const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.version).toBe('0.3.0');
        expect(Number(manifest.minimum_chrome_version)).toBeGreaterThanOrEqual(120);
        expect([...(manifest.permissions ?? [])].sort()).toEqual(['scripting', 'storage', 'webRequest']);
        expect([...(manifest.host_permissions ?? [])].sort()).toEqual([
            'https://www.nfe.fazenda.gov.br/*',
        ]);
        expect(JSON.stringify(manifest)).not.toContain('www1.nfe.fazenda.gov.br');
        expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
        expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
        expect(manifest.options_page).toBe('options.html');
        const scripts = manifest.content_scripts ?? [];
        expect(scripts).toHaveLength(1);
        expect(scripts.map((item) => item.matches?.[0]).sort()).toEqual([
            'https://www.nfe.fazenda.gov.br/portal/*',
        ]);
    });
});