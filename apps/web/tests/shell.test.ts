import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fromWeb = (path: string) => new URL(`../${path}`, import.meta.url);

describe('application shell', () => {
  it('has the minimal site files and no legacy architecture copy', () => {
    const required = [
      'index.html',
      'vite.config.ts',
      'wrangler.jsonc',
      'src/main.ts',
      'src/styles.css',
    ];

    for (const path of required) {
      expect(existsSync(fromWeb(path)), `${path} must exist`).toBe(true);
    }

    if (!required.every((path) => existsSync(fromWeb(path)))) return;

    const html = readFileSync(fromWeb('index.html'), 'utf8').toLowerCase();
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8').toLowerCase();
    const activeSource = `${html}\n${main}`;

    expect(activeSource).toContain('nfe agendamento');
    expect(activeSource).not.toContain('consulta em lote');
    expect(activeSource).not.toContain('pareamento');
    expect(activeSource).not.toContain('standby');
    expect(activeSource).not.toContain('login');
  });

  it('keeps certificate selection inside the site and exposes only bridge states', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');

    expect(main).toContain('id="certificate-select"');
    expect(main).toContain('id="certificate-apply"');
    expect(main).toContain('new BridgeClient()');
    expect(main).toContain('.listCertificates()');
    expect(main).toContain('.selectCertificate(');
    expect(main).toContain('Bridge conectado');
    expect(main).toContain('Bridge não encontrado');
    expect(main).toContain('Permissão de acesso local necessária');
    expect(main.toLowerCase()).not.toContain('janela de configuração');
  });
});
