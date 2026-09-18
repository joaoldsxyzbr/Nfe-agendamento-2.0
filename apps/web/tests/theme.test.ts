import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const danfeStyles = readFileSync(new URL('../src/danfe/styles.css', import.meta.url), 'utf8');

describe('site theme', () => {
  it('keeps the application dark with a restrained blue primary while DANFE stays white', () => {
    expect(styles).toContain('color-scheme: dark');
    expect(styles).toContain('--bg: #0b0f14');
    expect(styles).toContain('--blue: #4c8dff');
    expect(styles).toContain('--blue-strong: #3378e8');
    expect(styles).toContain('--yellow: #d9ae42');
    expect(styles).toMatch(/\.certificate-card, \.lookup-card[\s\S]*background:/);
    expect(danfeStyles).toMatch(/\.danfe-page[\s\S]*background:\s*#fff/);
  });

  it('keeps consultation and result inside one visual card with a reset action', () => {
    expect(main).toContain('<section class="lookup-card"');
    expect(main).toContain('<div class="lookup-result-section">');
    expect(main).toContain('<div class="lookup-result" id="result"');
    expect(main).not.toContain('class="result-card"');
    expect(main).toContain('id="lookup-reset"');
    expect(main).toContain("lookupReset.addEventListener('click', () => consultationController.reset());");
    expect(main).toContain("clearAccessKey: () => {");
    expect(main).toContain("accessKeyInput.value = '';");
    expect(main).toContain("appendResultState('Nenhuma NF-e carregada', 'Informe uma chave para iniciar.');");
    expect(styles).toContain('.lookup-result-section');
    expect(styles).toContain('.lookup-reset');
  });
});
