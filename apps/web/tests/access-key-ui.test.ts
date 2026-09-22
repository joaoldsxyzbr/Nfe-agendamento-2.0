import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/access-key-ui.ts', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

describe('access key UI', () => {
  it('loads the compatibility controller after the main app', () => {
    expect(index).toContain('<script type="module" src="/src/access-key-ui.ts"></script>');
    expect(index.indexOf('/src/access-key-ui.ts')).toBeGreaterThan(index.indexOf('/src/main.ts'));
  });

  it('presents the access key as 44 alphanumeric characters', () => {
    expect(source).toContain("keyHint.textContent = '44 caracteres'");
    expect(source).toContain("accessKeyInput.inputMode = 'text'");
    expect(source).toContain("accessKeyInput.autocapitalize = 'characters'");
    expect(source).toContain('accessKeyInput.spellcheck = false');
  });

  it('does not advertise the removed fixed batch limit anywhere in the current UI source', () => {
    expect(source).toContain("batchKeysInput.placeholder = 'Cole as chaves, uma por linha'");
    expect(source).not.toContain('até 10');
    expect(mainSource).not.toContain('até 10');
  });
});
