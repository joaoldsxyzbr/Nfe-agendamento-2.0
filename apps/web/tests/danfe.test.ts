import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNfeXml } from '../src/nfe/xml';

const KEY = '42260812345678000123550010000012341000012342';
const basicXml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');
const fullXml = readFileSync(new URL('./fixtures/nfe-danfe-full.xml', import.meta.url), 'utf8');

describe('DANFE approved behavior', () => {
  it('renders fiscal blocks, item first and useful transport', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const html = renderDanfeHtml(parseNfeXml(fullXml, KEY));

    for (const text of ['DANFE', 'Destinatário / Remetente', 'Cálculo do imposto', 'FATURA / DUPLICATA', 'PAGAMENTO', 'Dados dos produtos / serviços', 'RESERVADO AO FISCO']) {
      expect(html).toContain(text);
    }
    expect(html.indexOf('<th>Item</th>')).toBeLessThan(html.indexOf('<th>Código produto</th>'));
    expect(html).toContain('ABC-001');
    expect(html).toContain('TRANSPORTADORA TESTE');
  });

  it('omits transport when there is no useful transport data', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const html = renderDanfeHtml(parseNfeXml(basicXml, KEY));
    expect(html).not.toContain('Transportador / Volumes transportados');
  });

  it('shows Fernando Klein internal code without replacing cProd', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const base = parseNfeXml(basicXml, KEY);
    const nfe = {
      ...base,
      issuer: { ...base.issuer, taxId: '067.277.939-05' },
      products: [{ ...base.products[0], code: 'FK001', description: 'ALFACE' }],
    };
    const html = renderDanfeHtml(nfe);
    expect(html).toContain('FK001');
    expect(html).toContain('Int.: 73457');
  });

  it('clamps Ctrl+wheel zoom to the approved range', async () => {
    const { nextDanfeZoom } = await import('../src/danfe/render');
    expect(nextDanfeZoom(1, -100)).toBe(1.1);
    expect(nextDanfeZoom(2, -100)).toBe(2);
    expect(nextDanfeZoom(0.6, 100)).toBe(0.6);
  });

  it('binds Ctrl+wheel directly to the DANFE scroll viewport', () => {
    const source = readFileSync(new URL('../src/danfe/render.ts', import.meta.url), 'utf8');
    expect(source).toContain("container.querySelector<HTMLElement>('.danfe-scroll')");
    expect(source).toContain("scroll.addEventListener('wheel', wheel, { passive: false })");
    expect(source).toContain("scroll.removeEventListener('wheel', wheel)");
  });

  it('keeps approved A4 and compact item-column CSS', () => {
    const css = readFileSync(new URL('../src/danfe/styles.css', import.meta.url), 'utf8');
    for (const rule of ['width: 210mm', 'min-height: 277mm', 'font-family: Arial', '.products-table col.item', 'width: 8mm', '@media print']) {
      expect(css).toContain(rule);
    }
  });
});
