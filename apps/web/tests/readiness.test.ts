import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repoRoot = new URL('../../../', import.meta.url);
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ci = readFileSync(new URL('.github/workflows/ci.yml', repoRoot), 'utf8');

function readActiveSources(relativePath: string): string {
  const root = new URL(relativePath, repoRoot);
  const parts: string[] = [];

  const visit = (directory: URL) => {
    for (const entry of readdirSync(directory)) {
      const path = new URL(entry, directory.href.endsWith('/') ? directory : new URL(`${directory.href}/`));
      const stats = statSync(path);
      if (stats.isDirectory()) {
        visit(new URL(`${path.href}/`));
      } else if (/\.(cs|ts|html|css)$/.test(entry)) {
        parts.push(readFileSync(path, 'utf8'));
      }
    }
  };

  visit(root);
  return parts.join('\n').toLowerCase();
}

describe('final readiness', () => {
  it('keeps final operational states explicit in the site', () => {
    for (const state of [
      'Bridge não encontrado',
      'Permissão de acesso local necessária',
      'Nenhum certificado A1 utilizável',
      'Chave inválida',
      'Resultado fiscal',
      'Limite de consultas atingido',
      'SEFAZ indisponível',
      'Portal da NF-e indisponível',
      'Consulta pelo Portal cancelada',
      'XML inválido',
    ]) {
      expect(main, `missing UX state: ${state}`).toContain(state);
    }
  });

  it('does not reintroduce the removed Central architecture into active code', () => {
    const active = [
      readActiveSources('apps/web/src/'),
      readActiveSources('apps/bridge/src/'),
      readActiveSources('apps/bridge/windows/'),
    ].join('\n');

    for (const forbidden of [
      'pairing',
      'pareamento',
      'leader election',
      'standby',
      'shared queue',
      'batch lookup',
      '--lan',
      '0.0.0.0:17345',
    ]) {
      expect(active, `legacy concept found: ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('builds one Windows acceptance artifact with Bridge and Portal helper together', () => {
    expect(ci).toContain('windows-package:');
    expect(ci).toContain('runs-on: windows-2025');
    expect(ci).not.toContain('runs-on: windows-latest');
    expect(ci).toContain('NfeAgendamento.Bridge.csproj');
    expect(ci).toContain('NfeAgendamento.Portal.csproj');
    expect(ci).toContain('artifacts/NfeAgendamentoBridge');
    expect(ci).toContain('actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a');
    expect(ci).toContain('name: NfeAgendamentoBridge-win-x64');
  });
});
