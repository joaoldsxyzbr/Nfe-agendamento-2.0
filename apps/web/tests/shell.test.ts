import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fromWeb = (path: string) => new URL(`../${path}`, import.meta.url);

describe('application shell', () => {
  it('has the minimal site files and no legacy architecture copy', () => {
    const required = [
      'index.html',
      'vite.config.ts',
      'wrangler.jsonc',
      'public/favicon.ico',
      'public/brand-mark.png',
      'src/brand.css',
      'src/main.ts',
      'src/styles.css',
    ];

    for (const path of required) {
      expect(existsSync(fromWeb(path)), `${path} must exist`).toBe(true);
    }

    if (!required.every((path) => existsSync(fromWeb(path)))) return;

    const html = readFileSync(fromWeb('index.html'), 'utf8').toLowerCase();
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8').toLowerCase();
    const brandCss = readFileSync(fromWeb('src/brand.css'), 'utf8').toLowerCase();
    const activeSource = `${html}\n${main}`;

    expect(activeSource).toContain('nfe agendamento');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/src/brand.css"');
    expect(main).toContain('class="brand-mark" src="/brand-mark.png"');
    expect(main).toContain('<h1 class="brand-title"><span>nf-e</span><span>agendamento</span></h1>');
    expect(main).toContain('aria-hidden="true"');
    expect(brandCss).not.toContain("content: 'nf-e'");
    expect(brandCss).not.toContain("content: 'agendamento'");
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

  it('validates the key locally and validates XML before exposing download', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');

    expect(main).toContain("import { validateAccessKey } from './nfe/access-key';");
    expect(main).toMatch(/import \{[^}]*parseNfeXml[^}]*\} from '\.\/nfe\/xml';/);
    expect(main).toContain("lookupForm.addEventListener('submit'");

    const validateIndex = main.indexOf('validateAccessKey(');
    const lookupIndex = main.indexOf('bridgeClient.lookupNfe(');
    const parseIndex = main.indexOf('parseNfeXml(');
    const downloadIndex = main.indexOf('download =');

    expect(validateIndex).toBeGreaterThan(-1);
    expect(lookupIndex).toBeGreaterThan(validateIndex);
    expect(parseIndex).toBeGreaterThan(lookupIndex);
    expect(downloadIndex).toBeGreaterThan(parseIndex);
  });

  it('wires the DANFE preview, local zoom, close and browser print actions', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');
    const css = readFileSync(fromWeb('src/styles.css'), 'utf8');

    expect(main).toContain("import { attachDanfeZoom, renderDanfe } from './danfe/render';");
    expect(main).toContain("import './danfe/styles.css';");
    expect(main).toContain('id="danfe-viewer"');
    expect(main).toContain('Visualizar DANFE');
    expect(main).toContain('Baixar XML');
    expect(main).toContain('Ctrl + scroll para zoom');
    expect(main).toContain('renderDanfe(parsed)');
    expect(main).toContain('attachDanfeZoom(');
    expect(main).toContain('window.print()');
    expect(css).toContain('.danfe-modal');
    expect(css).toContain('.danfe-scroll');
  });
});
