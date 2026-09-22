import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const repoRoot = new URL('../../../', import.meta.url);
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const single = readFileSync(new URL('../src/nfe/consultation-controller.ts', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/batch/controller.ts', import.meta.url), 'utf8');

describe('Portal-only readiness', () => {
  it('has no active Windows Bridge or direct SEFAZ frontend', () => {
    expect(existsSync(new URL('apps/web/src/bridge', repoRoot))).toBe(false);
    const active = `${main}\n${single}\n${batch}`;
    expect(active).not.toContain('127.0.0.1:17345');
    expect(active).not.toContain('BridgeClient');
    expect(active).not.toContain('directLookup');
    expect(active).not.toContain('Consultando SEFAZ');
    expect(active).toContain('Portal Nacional');
  });

  it('keeps explicit extension/Portal states', () => {
    for (const state of [
      'Extensão não conectada',
      'Chave inválida',
      'Portal Nacional aberto',
      'Consulta pelo Portal cancelada',
      'XML inválido',
    ]) expect(`${main}\n${single}`).toContain(state);
  });
});
