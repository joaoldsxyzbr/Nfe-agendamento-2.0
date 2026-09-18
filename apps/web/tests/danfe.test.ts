import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNfeXml } from '../src/nfe/xml';

const KEY = '42260812345678000123550010000012341000012342';
const ALPHA_KEY = '422609PC3D315K000193550010000012341000012341';
const basicXml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');
const fullXml = readFileSync(new URL('./fixtures/nfe-danfe-full.xml', import.meta.url), 'utf8');

describe('DANFE approved behavior', () => {
  it('renders fiscal blocks, approved product columns and useful transport', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const html = renderDanfeHtml(parseNfeXml(fullXml, KEY));

    for (const text of ['DANFE', 'Destinatário / Remetente', 'Cálculo do imposto', 'FATURA / DUPLICATA', 'PAGAMENTO', 'Dados dos produtos / serviços', 'RESERVADO AO FISCO']) {
      expect(html).toContain(text);
    }

    expect(html.indexOf('<th>Item</th>')).toBeLessThan(html.indexOf('<th>Código produto</th>'));
    expect(html.indexOf('<th>Código produto</th>')).toBeLessThan(html.indexOf('<th>Descrição do produto / serviço</th>'));

    for (const column of ['<th>Descrição do produto / serviço</th>', '<th>Quant.</th>', '<th>Valor unit.</th>', '<th>Valor total</th>', '<th>Valor ICMS</th>', '<th>Alíq. ICMS</th>']) {
      expect(html).toContain(column);
    }
    for (const column of ['<th>NCM/SH</th>', '<th>Valor IPI</th>', '<th>Alíq. IPI</th>']) {
      expect(html).not.toContain(column);
    }
    expect(html).toContain('ABC-001');
    expect(html).toContain('TRANSPORTADORA TESTE');
    expect(html).toContain('class="products-filler"');
  });

  it('renders the approved traditional-refined middle band', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const html = renderDanfeHtml(parseNfeXml(fullXml, KEY));

    for (const fragment of [
      'class="danfe-block recipient-grid recipient-grid-refined"',
      'Município / UF',
      'Inscrição estadual / Indicador IE',
      'Data / hora saída / entrada',
      'class="danfe-block financial-strip"',
      'class="danfe-block total-grid refined-total-grid"',
      'class="total-row total-row-primary"',
      'class="total-row total-row-secondary"',
      'products-total',
      'class="danfe-block transport-grid refined-transport-grid"',
      'Placa / UF',
      'Quantidade / Espécie',
      'Marca / Numeração',
      'Peso bruto / líquido',
    ]) {
      expect(html).toContain(fragment);
    }

    expect(html).toContain('FATURA / DUPLICATA');
    expect(html).toContain('PAGAMENTO');
    expect(html.indexOf('<th>Item</th>')).toBeLessThan(html.indexOf('<th>Código produto</th>'));
  });

  it('repeats the mandatory fiscal header fields on continuation pages', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const base = parseNfeXml(fullXml, KEY);
    const longNfe = {
      ...base,
      products: Array.from({ length: 80 }, (_, index) => ({
        ...base.products[index % base.products.length],
        itemNumber: index + 1,
        description: `${base.products[index % base.products.length].description} PRODUTO DE TESTE COM DESCRIÇÃO ESTENDIDA ${index + 1}`,
      })),
    };
    const html = renderDanfeHtml(longNfe);
    const pages = countOccurrences(html, 'class="danfe-page"');

    expect(pages).toBeGreaterThan(1);
    expect(countOccurrences(html, 'Natureza da operação')).toBe(pages);
    expect(countOccurrences(html, 'Inscrição estadual do subst. tributário')).toBe(pages);
    expect(countOccurrences(html, 'Código de barras da chave de acesso')).toBe(pages);
  });

  it('encodes alphanumeric access keys using hybrid Code 128 C/A and preserves letters in display', async () => {
    const { encodeAccessKeyCode128, renderDanfeHtml } = await import('../src/danfe/render');
    const encoded = encodeAccessKeyCode128(ALPHA_KEY);

    expect(encoded[0]).toBe(105);
    expect(encoded).toContain(101);
    expect(encoded).toContain(99);
    expect(encoded.at(-1)).toBe(106);

    const base = parseNfeXml(basicXml, KEY);
    const html = renderDanfeHtml({ ...base, accessKey: ALPHA_KEY });
    expect(html).toContain('09PC');
    expect(html).toContain('3D31');
    expect(html).toContain('5K00');
    expect(html).toContain('Código de barras da chave de acesso');
  });

  it('shows authentication guidance and issuer phone in the fiscal header', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const html = renderDanfeHtml(parseNfeXml(fullXml, KEY));

    expect(html).toContain('Consulta de autenticidade no portal nacional da NF-e');
    expect(html).toContain('www.nfe.fazenda.gov.br/portal');
    expect(html).toContain('Fone/Fax: 48999999999');
  });

  it('shows package composition from commercial and tributary quantities', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const xml = fullXml.replace(
      '<uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>10.5000</vUnCom>',
      '<uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>10.5000</vUnCom><uTrib>UN</uTrib><qTrib>40.0000</qTrib><vUnTrib>0.5250</vUnTrib>',
    );
    const parsed = parseNfeXml(xml, KEY);
    const html = renderDanfeHtml(parsed);

    expect(parsed.products[0].tributaryUnit).toBe('UN');
    expect(parsed.products[0].tributaryQuantity).toBe(40);
    expect(html).toContain('CX C/ 20 UN');
  });

  it('renders destination ICMS and total tax when present in ICMSTot', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const xml = fullXml.replace('<vFCPUFDest>0.15</vFCPUFDest>', '<vFCPUFDest>0.15</vFCPUFDest><vICMSUFDest>1.23</vICMSUFDest><vTotTrib>4.56</vTotTrib>');
    const html = renderDanfeHtml(parseNfeXml(xml, KEY));

    expect(html).toContain('V. ICMS UF dest.');
    expect(html).toContain('V. tot. trib.');
    expect(html).toContain('1,23');
    expect(html).toContain('4,56');
  });

  it('omits transport when there is no useful transport data', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const html = renderDanfeHtml(parseNfeXml(basicXml, KEY));
    expect(html).not.toContain('Transportador / Volumes transportados');
  });

  it('omits an empty freight mode 9 transport block', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const base = parseNfeXml(fullXml, KEY);
    const html = renderDanfeHtml({
      ...base,
      transport: {
        freightMode: '9',
        carrier: { taxId: '', name: '', stateRegistration: '', address: '', city: '', state: '' },
        vehicle: { plate: '', state: '', rntc: '' },
        volumes: [],
      },
    });

    expect(html).not.toContain('Transportador / Volumes transportados');
    expect(html).not.toContain('9-Sem Transporte');
  });

  it('shows Fernando Klein and Dionisio internal codes without replacing cProd', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const base = parseNfeXml(basicXml, KEY);

    for (const name of ['FERNANDO KLEIN', 'DIONISIO']) {
      const nfe = {
        ...base,
        issuer: { ...base.issuer, name },
        products: [{ ...base.products[0], code: 'FK001', description: 'ALFACE' }],
      };
      const html = renderDanfeHtml(nfe);
      expect(html).toContain('FK001');
      expect(html).toContain('[73457]');
      expect(html).not.toContain('Int.: 73457');
    }
  });

  it('clamps Ctrl+wheel zoom to the approved range', async () => {
    const { nextDanfeZoom } = await import('../src/danfe/render');
    expect(nextDanfeZoom(1, -100)).toBe(1.1);
    expect(nextDanfeZoom(2, -100)).toBe(2);
    expect(nextDanfeZoom(0.6, 100)).toBe(0.6);
  });

  it('loads the direct DANFE viewport zoom listener', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('/src/danfe/zoom-direct.ts');
  });

  it('keeps print pagination deterministic and continuation headers complete', () => {
    const pagination = readFileSync(new URL('../src/danfe/pagination.ts', import.meta.url), 'utf8');
    expect(pagination).not.toContain('getBoundingClientRect');
    expect(pagination).not.toContain('getComputedStyle');
    expect(pagination).not.toContain('danfe-measuring');
    expect(pagination).toContain('FIRST_PAGE_PRODUCT_SPACE_MM = 110');
    expect(pagination).toContain('CONTINUATION_PRODUCT_SPACE_MM = 204');
    expect(pagination).toContain("row.querySelector('.internal-product-code')");
    expect(pagination).toContain("row.querySelector('.internal-quantity')");
    expect(pagination).toContain("page.querySelector<HTMLElement>('.operation-grid')");
    expect(pagination).toContain("page.querySelector<HTMLElement>('.issuer-registry')");
    expect(pagination).toContain("body.querySelector<HTMLTableRowElement>('.products-filler')");
  });

  it('keeps the approved A4 layout readable and uses the simplified product grid', () => {
    const css = readFileSync(new URL('../src/danfe/styles.css', import.meta.url), 'utf8');
    for (const rule of ['width: 210mm', 'min-height: 277mm', 'font-family: Arial', '.products-table col.item', '@media print']) {
      expect(css).toContain(rule);
    }
    expect(css).toContain('grid-template-columns: 60mm 27mm 1fr');
    expect(css).toContain('min-height: 40px');
    expect(css).toContain('min-height: 94px');
    expect(css).toContain('min-height: 92px');
    expect(css).toContain('padding: 3.5mm');
    expect(css).toContain('font-size: 8.9px');
    expect(css).toContain('.fiscal-label { font-size: 6.35px; font-weight: 700; }');
    expect(css).toContain('.products-table td { font-size: 8.15px; line-height: 1.18; }');
    expect(css).toContain('.products-table col.description { width: 62mm; }');
    for (const rule of ['.recipient-grid-refined', '.financial-strip', '.refined-total-grid', '.total-row-primary', '.total-row-secondary', '.refined-transport-grid']) {
      expect(css).toContain(rule);
    }
    expect(css).toContain('align-items: flex-start; justify-content: center; padding: 5px 8px; text-align: left;');
    expect(css).toContain('.products-table.danfe-products-fill { width: 100%; flex: 1 1 auto; border-collapse: collapse; table-layout: fixed; }');
    expect(css).toContain('.products-table .products-filler { height: 100%; }');
    expect(css).toContain('.products-table .products-filler td { height: 100%; padding: 0; }');
    expect(css).toContain('.danfe-footer { margin-top: auto;');
    expect(css).not.toContain('.products-table col.ncm');
    expect(css).not.toContain('.danfe-measuring');
    expect(css).not.toContain('tbody tr:last-child td { height: 100%; }');
  });
});

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
