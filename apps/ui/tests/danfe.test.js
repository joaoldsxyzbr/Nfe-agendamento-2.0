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
    it('renders pickup, delivery and ISSQN only when the corresponding XML groups exist', async () => {
        const { renderDanfeHtml } = await import('../src/danfe/render');
        const conditionalXml = fullXml
            .replace('</dest>', `</dest>
      <retirada><CNPJ>11222333000144</CNPJ><xNome>DEPÓSITO DE RETIRADA</xNome><IE>123450001</IE><xLgr>Rua da Retirada</xLgr><nro>50</nro><xBairro>Industrial</xBairro><xMun>Biguaçu</xMun><UF>SC</UF><CEP>88160001</CEP><fone>4830303030</fone></retirada>
      <entrega><CNPJ>55666777000188</CNPJ><xNome>LOCAL DE ENTREGA</xNome><IE>987650001</IE><xLgr>Avenida da Entrega</xLgr><nro>900</nro><xCpl>Galpão B</xCpl><xBairro>Centro</xBairro><xMun>São José</xMun><UF>SC</UF><CEP>88100001</CEP><fone>4831313131</fone></entrega>`)
            .replace('</ICMSTot></total>', '</ICMSTot><ISSQNtot><vServ>150.00</vServ><vBC>140.00</vBC><vISS>7.00</vISS></ISSQNtot></total>');
        const html = renderDanfeHtml(parseNfeXml(conditionalXml, KEY));
        for (const text of [
            'Informações do local de retirada',
            'DEPÓSITO DE RETIRADA',
            'Informações do local de entrega',
            'LOCAL DE ENTREGA',
            'Cálculo do ISSQN',
            'Valor total dos serviços',
            'Base de cálculo do ISSQN',
            'Valor do ISSQN',
            '987654',
            '150,00',
            '140,00',
            '7,00',
        ]) {
            expect(html).toContain(text);
        }
        const ordinaryHtml = renderDanfeHtml(parseNfeXml(basicXml, KEY));
        expect(ordinaryHtml).not.toContain('Informações do local de retirada');
        expect(ordinaryHtml).not.toContain('Informações do local de entrega');
        expect(ordinaryHtml).not.toContain('Cálculo do ISSQN');
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
        const xml = fullXml.replace('<uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>10.5000</vUnCom>', '<uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>10.5000</vUnCom><uTrib>UN</uTrib><qTrib>40.0000</qTrib><vUnTrib>0.5250</vUnTrib>');
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
    it('keeps a single Ctrl+wheel zoom implementation wired through the viewer', () => {
        const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
        const render = readFileSync(new URL('../src/danfe/render.js', import.meta.url), 'utf8');
        const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
        expect(main).toContain('attachZoom: attachDanfeZoom');
        expect(render).toContain("container.addEventListener('wheel', wheel, { passive: false })");
        expect(html).not.toContain('/src/danfe/zoom-direct.js');
    });
    it('keeps print pagination deterministic and continuation headers complete', () => {
        const pagination = readFileSync(new URL('../src/danfe/pagination.js', import.meta.url), 'utf8');
        expect(pagination).not.toContain('getBoundingClientRect');
        expect(pagination).not.toContain('getComputedStyle');
        expect(pagination).not.toContain('danfe-measuring');
        expect(pagination).toContain('FIRST_PAGE_PRODUCT_SPACE_MM = 110');
        expect(pagination).toContain('CONTINUATION_PRODUCT_SPACE_MM = 204');
        expect(pagination).toContain("row.querySelector('.internal-product-code')");
        expect(pagination).toContain("row.querySelector('.internal-quantity')");
        expect(pagination).toContain("page.querySelector('.operation-grid')");
        expect(pagination).toContain("page.querySelector('.issuer-registry')");
        expect(pagination).toContain("body.querySelector('.products-filler')");
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
        expect(css).toContain('.fiscal-value { display: block; min-width: 0; max-width: 100%;');
        expect(css).toContain('.recipient-email .fiscal-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; overflow-wrap: normal; }');
        expect(css).toContain('.recipient-grid-refined > div { min-width: 0; min-height: 22px; overflow: hidden;');
        expect(css).toContain('.refined-transport-grid > div { min-width: 0; min-height: 22px; overflow: hidden;');
        expect(css).toContain('.products-table td { font-size: 8.15px; line-height: 1.18; }');
        expect(css).toContain('.products-table col.description { width: 62mm; }');
        for (const rule of ['.recipient-grid-refined', '.location-grid', '.issqn-grid', '.financial-strip', '.refined-total-grid', '.total-row-primary', '.total-row-secondary', '.refined-transport-grid']) {
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
    it('keeps a readable DANFE when optional fiscal data is absent or irregular', async () => {
        const { renderDanfeHtml } = await import('../src/danfe/render');
        const original = parseNfeXml(fullXml, KEY);
        const withoutOptionalData = {
            ...original,
            recipient: null,
            issuer: { ...original.issuer, taxId: '12345678901', address: null },
            invoiceType: '0',
            number: 'SN',
            series: 'S',
            issuedAt: '2026-09-15',
            exitedAt: 'data-invalida',
            protocol: null,
            billing: { invoice: null, duplicates: [] },
            payments: [{ methodCode: '', methodName: '', value: 0 }],
            transport: null,
            products: [{
                ...original.products[0],
                unit: 'CX',
                tributaryUnit: 'UN',
                quantity: 0,
                tributaryQuantity: 5,
            }],
        };
        const html = renderDanfeHtml(withoutOptionalData);
        expect(html).toContain('123.456.789-01');
        expect(html).toContain('15/09/2026');
        expect(html).toContain('data-invalida');
        expect(html).toContain('Não informado');
        expect(html).not.toContain('Fone/Fax:');
        expect(html).not.toContain('CX C/');

        const invalidPackage = {
            ...withoutOptionalData,
            issuedAt: 'data-invalida',
            exitedAt: null,
            payments: [],
            products: [{
                ...original.products[0],
                unit: 'CX',
                tributaryUnit: 'UN',
                quantity: 2,
                tributaryQuantity: 3,
            }],
        };
        const secondHtml = renderDanfeHtml(invalidPackage);
        expect(secondHtml).toContain('data-invalida');
        expect(secondHtml).not.toContain('CX C/');
        expect(secondHtml).toContain('DANFE');
    });

});
function countOccurrences(value, needle) {
    return value.split(needle).length - 1;
}
