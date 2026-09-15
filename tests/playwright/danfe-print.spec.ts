import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { renderDanfeHtml } from '../../apps/web/src/danfe/render';
import type { ParsedNfe, ParsedNfeProduct } from '../../apps/web/src/nfe/xml';

const NUMERIC_KEY = '42260812345678000123550010000012341000012342';
const ALPHA_KEY = '422609PC3D315K000193550010000012341000012341';
const danfeCss = await readFile(new URL('../../apps/web/src/danfe/styles.css', import.meta.url), 'utf8');

test('NF-e curta gera exatamente uma A4 sem overflow', async ({ page }, testInfo) => {
  const nfe = createNfe(NUMERIC_KEY, 4);
  const renderedPages = await renderForPrint(page, nfe);

  expect(renderedPages).toBe(1);
  await expectPrintBounds(page);
  const pdfPages = await generatePdf(page, testInfo, 'danfe-curta.pdf');
  expect(pdfPages).toBe(renderedPages);
});

test('NF-e longa preserva paginação, NCM e cabeçalho fiscal nas continuações', async ({ page }, testInfo) => {
  const nfe = createNfe(ALPHA_KEY, 85, true);
  const renderedPages = await renderForPrint(page, nfe);

  expect(renderedPages).toBeGreaterThan(1);
  await expectPrintBounds(page);

  const pageFacts = await page.locator('.danfe-page').evaluateAll((elements) =>
    elements.map((element) => ({
      hasNature: element.textContent?.includes('Natureza da operação') ?? false,
      hasIssuerRegistry: element.textContent?.includes('Inscrição estadual do subst. tributário') ?? false,
      hasNcm: element.textContent?.includes('NCM/SH') ?? false,
      hasBarcode: element.querySelector('svg[aria-label="Código de barras da chave de acesso"]') !== null,
      pageLabel: element.querySelector('.danfe-identity > span:last-child')?.textContent ?? '',
    })),
  );

  for (const [index, facts] of pageFacts.entries()) {
    expect(facts.hasNature).toBe(true);
    expect(facts.hasIssuerRegistry).toBe(true);
    expect(facts.hasNcm).toBe(true);
    expect(facts.hasBarcode).toBe(true);
    expect(facts.pageLabel).toBe(`Folha ${index + 1}/${renderedPages}`);
  }

  await expect(page.locator('.access-key').first()).toContainText('09PC');
  await expect(page.locator('.access-key').first()).toContainText('3D31');
  const pdfPages = await generatePdf(page, testInfo, 'danfe-longa-alfanumerica.pdf');
  expect(pdfPages).toBe(renderedPages);
});

async function renderForPrint(page: Page, nfe: ParsedNfe): Promise<number> {
  const html = renderDanfeHtml(nfe);
  await page.setContent(`<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <style>html, body, #app { margin: 0; padding: 0; } ${danfeCss}</style>
      </head>
      <body>
        <main id="app">
          <section class="danfe">
            <div class="danfe-modal">
              <div class="danfe-scroll">
                <div id="danfe-content"><div class="danfe-pages">${html}</div></div>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>`);
  await page.emulateMedia({ media: 'print' });
  return page.locator('.danfe-page').count();
}

async function expectPrintBounds(page: Page): Promise<void> {
  const metrics = await page.locator('.danfe-page').evaluateAll((elements) =>
    elements.map((element) => {
      const pageRect = element.getBoundingClientRect();
      const childBottom = Array.from(element.children).reduce(
        (maximum, child) => Math.max(maximum, child.getBoundingClientRect().bottom),
        pageRect.top,
      );
      return {
        width: pageRect.width,
        height: pageRect.height,
        bottomOverflow: childBottom - pageRect.bottom,
        scrollOverflow: element.scrollHeight - element.clientHeight,
      };
    }),
  );

  for (const metric of metrics) {
    expect(metric.width).toBeGreaterThan(790);
    expect(metric.width).toBeLessThan(800);
    expect(metric.height).toBeGreaterThan(1115);
    expect(metric.height).toBeLessThan(1130);
    expect(metric.bottomOverflow).toBeLessThanOrEqual(1.5);
    expect(metric.scrollOverflow).toBeLessThanOrEqual(2);
  }
}

async function generatePdf(page: Page, testInfo: TestInfo, name: string): Promise<number> {
  const path = testInfo.outputPath(name);
  await mkdir(dirname(path), { recursive: true });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  await writeFile(path, pdf);
  const pages = pdf.toString('latin1').match(/\/Type\s*\/Page\b/g);
  expect(pages, 'Chromium deve gerar páginas PDF reconhecíveis').not.toBeNull();
  return pages?.length ?? 0;
}

function createNfe(accessKey: string, productCount: number, longDescriptions = false): ParsedNfe {
  const products = Array.from({ length: productCount }, (_, index) => createProduct(index + 1, longDescriptions));
  return {
    accessKey,
    originalXml: '<NFe />',
    model: '55',
    series: '1',
    number: '1234',
    operationNature: 'VENDA DE MERCADORIA',
    invoiceType: '1',
    issuedAt: '2026-09-15T10:30:00-03:00',
    exitedAt: '2026-09-15T10:35:00-03:00',
    issuer: {
      taxId: 'PC3D315K000193',
      name: 'EMPRESA EMITENTE TESTE LTDA',
      stateRegistration: '123456789',
      address: {
        street: 'Rua de Teste',
        number: '100',
        district: 'Centro',
        city: 'Biguaçu',
        state: 'SC',
        postalCode: '88160000',
        phone: '48999999999',
      },
    },
    recipient: {
      taxId: '12345678909',
      name: 'DESTINATÁRIO DE TESTE',
      address: {
        street: 'Avenida Central',
        number: '200',
        district: 'Centro',
        city: 'Florianópolis',
        state: 'SC',
        postalCode: '88000000',
      },
    },
    totals: {
      products: productCount * 10,
      freight: 0,
      insurance: 0,
      discount: 0,
      other: 0,
      invoice: productCount * 10,
      icmsBase: productCount * 10,
      icms: productCount * 1.2,
      icmsStBase: 0,
      icmsSt: 0,
      importTax: 0,
      icmsUfRemet: 0,
      icmsUfDest: 0,
      fcpUfDest: 0,
      totalTax: 0,
      pis: 0,
      ipi: 0,
      cofins: 0,
    },
    products,
    billing: { invoice: null, duplicates: [] },
    payments: [],
    transport: null,
    additional: {
      contributor: 'Documento de teste automatizado do layout A4. Não possui validade fiscal.',
      taxAuthority: '',
    },
    protocol: {
      number: '342260000000001',
      receivedAt: '2026-09-15T10:31:00-03:00',
      statusCode: '100',
      statusMessage: 'Autorizado o uso da NF-e',
    },
  };
}

function createProduct(itemNumber: number, longDescription: boolean): ParsedNfeProduct {
  return {
    itemNumber,
    code: `PRD${String(itemNumber).padStart(4, '0')}`,
    description: longDescription
      ? `PRODUTO DE TESTE ${itemNumber} COM DESCRIÇÃO MAIS LONGA PARA EXERCITAR A QUEBRA DE LINHA E A PAGINAÇÃO DO DANFE`
      : `PRODUTO DE TESTE ${itemNumber}`,
    ncm: '12345678',
    cfop: '5102',
    unit: 'UN',
    quantity: 1,
    unitPrice: 10,
    tributaryUnit: 'UN',
    tributaryQuantity: 1,
    totalPrice: 10,
    discount: 0,
    tax: {
      cst: '000',
      icmsBase: 10,
      icms: 1.2,
      icmsRate: 12,
      ipi: 0,
      ipiRate: 0,
      pis: 0,
      cofins: 0,
      taxNote: '',
    },
  };
}
