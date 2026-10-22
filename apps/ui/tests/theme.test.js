import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const batchStyles = readFileSync(new URL('../src/batch.css', import.meta.url), 'utf8');
const danfeStyles = readFileSync(new URL('../src/danfe/styles.css', import.meta.url), 'utf8');
describe('site theme', () => {
    it('keeps the application dark with blue focus, green consultation and white DANFE', () => {
        expect(styles).toContain('color-scheme: dark');
        expect(styles).toContain('--bg: #0b0f14');
        expect(styles).toContain('--blue: #4c8dff');
        expect(styles).toContain('--blue-strong: #3378e8');
        expect(styles).toContain('--yellow: #d9ae42');
        expect(styles).toMatch(/\.lookup-card[\s\S]*background:/);
        expect(danfeStyles).toMatch(/\.danfe-page[\s\S]*background:\s*#fff/);
    });
    it('keeps one fixed consultation layout for single and batch input', () => {
        expect(styles).toContain('scrollbar-gutter: stable');
        expect(main).not.toContain('syncCompactMode');
        expect(main).not.toContain('is-compact-single');
        expect(batchStyles).not.toContain('is-compact-single');
        expect(batchStyles).toContain('grid-template-columns: 26px minmax(0, 1fr) 118px 280px');
        expect(batchStyles).toContain('box-shadow: inset 3px 0 0 var(--green)');
        expect(batchStyles).toContain('#batch-start:not(:disabled)');
        expect(batchStyles).toContain('background: #259e53');
        expect(batchStyles).toContain('background: #1a232d');
        expect(batchStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
        expect(batchStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
        expect(batchStyles).toContain(".batch-list[data-count='1'] .batch-list-header");
        expect(batchStyles).not.toContain("grid-row: 2;");
        expect(batchStyles).toContain('min-height: 34px');
        expect(batchStyles).toContain('max-height: 148px');
        expect(batchStyles).toContain('.batch-form-footer > div:first-child');
        expect(styles).toContain('padding: 18px;');
    });
    it('keeps one consultation card with a reset action for the unified flow', () => {
        expect(main).toContain('<section class="lookup-card"');
        expect(main).toContain('id="batch-consultation-panel"');
        expect(main).toContain('id="batch-list"');
        expect(main).not.toContain('class="result-card"');
        expect(main).toContain('id="batch-reset"');
        expect(main).toContain("batchReset.addEventListener('click', () => {");
        expect(main).toContain('batchController.reset();');
        expect(main).toContain('updateKeyCount();');
        expect(styles).toContain('.lookup-reset');
    });
});
