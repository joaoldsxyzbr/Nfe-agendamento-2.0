import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fromWeb = (path: string) => new URL(`../${path}`, import.meta.url);

describe('application shell', () => {
  it('has the site files and no legacy central architecture copy', () => {
    const required = [
      'index.html',
      'vite.config.ts',
      'wrangler.jsonc',
      'public/favicon.ico',
      'public/brand-mark.png',
      'src/brand.css',
      'src/main.ts',
      'src/styles.css',
      'src/batch.css',
      'src/batch/controller.ts',
      'src/bridge/certificate-controller.ts',
      'src/danfe/viewer.ts',
      'src/nfe/consultation-controller.ts',
      'src/batch/input.ts',
      'src/batch/ui.ts',
      'src/batch/zip.ts',
    ];

    for (const path of required) {
      expect(existsSync(fromWeb(path)), `${path} must exist`).toBe(true);
    }

    if (!required.every((path) => existsSync(fromWeb(path)))) return;

    const html = readFileSync(fromWeb('index.html'), 'utf8').toLowerCase();
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8').toLowerCase();
    const brandCss = readFileSync(fromWeb('src/brand.css'), 'utf8').toLowerCase();
    const stylesCss = readFileSync(fromWeb('src/styles.css'), 'utf8');
    const activeSource = `${html}\n${main}`;

    expect(activeSource).toContain('nfe agendamento');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('href="/favicon.ico"');
    expect(html).toContain('href="/src/brand.css"');
    expect(html).toContain('src="/src/batch/ui.ts"');
    expect(html.indexOf('/src/main.ts')).toBeLessThan(html.indexOf('/src/batch/ui.ts'));
    expect(main).toContain('class="brand-mark" src="/brand-mark.png"');
    expect(main).toContain('<h1 class="brand-title"><span>nf-e</span><span>agendamento</span></h1>');
    expect(main).toContain('aria-hidden="true"');
    expect(brandCss).not.toContain("content: 'nf-e'");
    expect(brandCss).not.toContain("content: 'agendamento'");
    expect(stylesCss).toContain('--font-sans: "Segoe UI Variable Text"');
    expect(stylesCss).toContain('--font-display: "Segoe UI Variable Display"');
    expect(stylesCss).toContain('--font-mono: "Cascadia Mono"');
    expect(activeSource).not.toContain('pareamento');
    expect(activeSource).not.toContain('standby');
    expect(activeSource).not.toContain('login');
  });

  it('keeps certificate selection inside the site and exposes only bridge states', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');
    const controller = readFileSync(fromWeb('src/bridge/certificate-controller.ts'), 'utf8');

    expect(main).toContain('id="certificate-select"');
    expect(main).toContain('id="certificate-apply"');
    expect(main).toContain('new BridgeClient()');
    expect(main).toContain("import { createCertificateController } from './bridge/certificate-controller';");
    expect(main).toContain('void certificateController.refresh()');
    expect(controller).toContain('deps.bridge.listCertificates()');
    expect(controller).toContain('deps.bridge.selectCertificate(thumbprint)');
    expect(controller).toContain('Bridge conectado');
    expect(controller).toContain('Bridge não encontrado');
    expect(controller).toContain('Permissão de acesso local necessária');
    expect(main.toLowerCase()).not.toContain('janela de configuração');
  });

  it('validates the single key locally and validates XML before exposing download', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');
    const controller = readFileSync(fromWeb('src/nfe/consultation-controller.ts'), 'utf8');

    expect(main).toContain("import { validateAccessKey } from './nfe/access-key';");
    expect(main).toContain("import { createConsultationController } from './nfe/consultation-controller';");
    expect(main).toMatch(/import \{[^}]*parseNfeXml[^}]*\} from '\.\/nfe\/xml';/);
    expect(main).toContain("lookupForm.addEventListener('submit'");
    expect(main).toContain('void consultationController.submit()');

    const validateIndex = controller.indexOf('deps.validateAccessKey(');
    const lookupIndex = controller.indexOf('deps.bridge.lookupNfe(');
    const parseIndex = controller.indexOf('deps.parseXml(');
    const downloadIndex = main.indexOf('download =');

    expect(validateIndex).toBeGreaterThan(-1);
    expect(lookupIndex).toBeGreaterThan(validateIndex);
    expect(parseIndex).toBeGreaterThan(lookupIndex);
    expect(downloadIndex).toBeGreaterThan(-1);
  });

  it('resolves supplier identity locally for single SEFAZ and Portal results', () => {
    const controller = readFileSync(fromWeb('src/nfe/consultation-controller.ts'), 'utf8');

    expect(controller).toContain('async function withSupplierRule(');
    expect(controller).toContain('deps.bridge.resolveSupplier(parsed.issuer.taxId)');
    expect(controller).toContain('await renderParsedXml(lookup.xml, validation.value)');
    expect(controller).toContain('await renderParsedXml(portalStatus.xml, accessKey)');
  });

  it('uses one visible consultation flow with per-item DANFE and XML actions', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');
    const batchController = readFileSync(fromWeb('src/batch/controller.ts'), 'utf8');
    const batchUi = readFileSync(fromWeb('src/batch/ui.ts'), 'utf8');
    const batchCss = readFileSync(fromWeb('src/batch.css'), 'utf8');

    expect(main).toContain('id="mode-batch"');
    expect(main).toContain('id="batch-keys"');
    expect(main).toContain('id="batch-list"');
    expect(main).toContain("import { createBatchController } from './batch/controller';");
    expect(batchController).toContain('async function processDirectItem');
    expect(batchController).toContain('async function processPortalItem');
    expect(batchController).toContain("route = 'portal'");
    expect(main).toContain('Visualizar DANFE');
    expect(main).toContain('Baixar XML');
    expect(main).toContain('Baixar XMLs (.zip)');
    expect(main).toContain('Imprimir DANFEs');
    expect(main).toContain('createZip: createStoredZip');
    expect(batchController).toContain('deps.createZip(');
    expect(batchUi).toContain("batchKeysInput.placeholder = 'Cole as chaves, uma por linha'");
    expect(batchUi).toContain('Sem limite fixo de quantidade');
    expect(batchUi).toContain('modeBatch.click()');
    expect(batchUi).toContain("modeControl.style.display = 'none'");
    expect(batchUi).toContain("batchStart.textContent = 'Consultar'");
    expect(batchUi).toContain("reset.textContent = 'Nova consulta'");
    expect(batchUi).toContain('reset.hidden = true');
    expect(batchUi).toContain('singleConsultationPending = true');
    expect(batchUi).toContain('singleConsultationCompleted = true');
    expect(batchUi).toContain('batchStart.hidden = singleConsultationCompleted');
    expect(batchUi).toContain('reset.hidden = !singleConsultationCompleted');
    expect(batchUi).toContain("batchForm.addEventListener('submit'");
    expect(batchUi).toContain('capture: true');
    expect(batchUi).toContain('batchKeysInput.focus()');
    expect(batchUi).toContain('actions.append(batchStart, reset)');
    expect(batchUi).toContain("batchPanel.classList.toggle('is-compact-single', getValidKeyCount() <= 1)");
    expect(batchCss).toContain('#batch-consultation-panel.is-compact-single #batch-form textarea');
    expect(batchCss).toContain('#batch-consultation-panel.is-compact-single .batch-toolbar-actions #batch-zip');
    expect(batchCss).toContain('#batch-consultation-panel.is-compact-single .batch-toolbar-actions #batch-print');
    expect(batchCss).not.toContain(":has(.batch-item[data-state='success']) .batch-run-toolbar {");
    expect(batchCss).not.toContain(".batch-item[data-state='success'] .batch-order,");
    expect(batchCss).not.toContain(".batch-item[data-state='success'] .batch-key,");
    expect(batchCss).not.toContain(".batch-item[data-state='success'] .batch-status {");
  });

  it('shows a clear message for cancelled NF-e status 653', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');

    expect(main).toContain("lookup.cStat === '653'");
    expect(main).toContain("'NF-e cancelada'");
    expect(main).toContain('Esta nota fiscal foi cancelada na SEFAZ e, por isso, o XML não está disponível para download.');
    expect(main).toContain('Código SEFAZ: 653.');
  });

  it('wires the DANFE preview, local zoom, close and browser print actions', () => {
    const main = readFileSync(fromWeb('src/main.ts'), 'utf8');
    const viewer = readFileSync(fromWeb('src/danfe/viewer.ts'), 'utf8');
    const css = readFileSync(fromWeb('src/styles.css'), 'utf8');

    expect(main).toContain("import { attachDanfeZoom, renderDanfe } from './danfe/render';");
    expect(main).toContain("import { createDanfeViewer } from './danfe/viewer';");
    expect(main).toContain("import './danfe/styles.css';");
    expect(main).toContain('id="danfe-viewer"');
    expect(main).toContain('Visualizar DANFE');
    expect(main).toContain('Baixar XML');
    expect(main).toContain('Ctrl + scroll para zoom');
    expect(main).toContain('render: renderDanfe');
    expect(main).toContain('attachZoom: attachDanfeZoom');
    expect(viewer).toContain('elements.content.replaceChildren');
    expect(viewer).toContain('deps.attachZoom(elements.viewer)');
    expect(viewer).toContain('deps.print()');
    expect(css).toContain('.danfe-modal');
    expect(css).toContain('.danfe-scroll');
  });
});
