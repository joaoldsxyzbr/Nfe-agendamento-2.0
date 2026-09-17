import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNfeXml } from '../src/nfe/xml';

const KEY = '42260812345678000123550010000012341000012342';
const fullXml = readFileSync(new URL('./fixtures/nfe-danfe-full.xml', import.meta.url), 'utf8');

describe('DANFE product table approved layout', () => {
  it('keeps Item first and hides NCM/IPI columns from the visual grid', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const html = renderDanfeHtml(parseNfeXml(fullXml, KEY));

    expect(html.indexOf('<th>Item</th>')).toBeLessThan(html.indexOf('<th>Código produto</th>'));
    expect(html.indexOf('<th>Código produto</th>')).toBeLessThan(html.indexOf('<th>Descrição do produto / serviço</th>'));

    for (const column of ['<th>NCM/SH</th>', '<th>Valor IPI</th>', '<th>Alíq. IPI</th>']) {
      expect(html).not.toContain(column);
    }

    for (const column of ['<th>O/CST</th>', '<th>CFOP</th>', '<th>UN</th>', '<th>Quant.</th>', '<th>Valor unit.</th>', '<th>Valor total</th>', '<th>Valor ICMS</th>', '<th>Alíq. ICMS</th>']) {
      expect(html).toContain(column);
    }

    expect(html).toContain('<td colspan="13">Nenhum produto informado no XML.</td>');
    expect((html.match(/<td><\/td>/g) ?? []).length).toBeGreaterThanOrEqual(13);
  });

  it('reserves the recovered width for the description column', () => {
    const css = readFileSync(new URL('../src/danfe/styles.css', import.meta.url), 'utf8');

    expect(css).toContain('.products-table col.description { width: 62mm; }');
    expect(css).not.toContain('.products-table col.ncm');
  });
});
