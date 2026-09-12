import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNfeXml } from '../src/nfe/xml';

const KEY = '42260812345678000123550010000012341000012342';
const basicXml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');

describe('Souza Cruz quantity in DANFE', () => {
  it('shows the fiscal quantity and internal units without changing the XML', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const base = parseNfeXml(basicXml, KEY);
    const nfe = {
      ...base,
      issuer: { ...base.issuer, taxId: '33.009.911/0285-72' },
      products: [{ ...base.products[0], quantity: 0.2 }],
    };

    const originalXml = nfe.originalXml;
    const html = renderDanfeHtml(nfe);

    expect(html).toContain('0,2000');
    expect(html).toContain('Int.: 10 UN');
    expect(nfe.originalXml).toBe(originalXml);
  });

  it('does not show an internal quantity for another supplier', async () => {
    const { renderDanfeHtml } = await import('../src/danfe/render');
    const base = parseNfeXml(basicXml, KEY);
    const nfe = {
      ...base,
      issuer: { ...base.issuer, taxId: '12.345.678/0001-90' },
      products: [{ ...base.products[0], quantity: 0.2 }],
    };

    const html = renderDanfeHtml(nfe);

    expect(html).toContain('0,2000');
    expect(html).not.toContain('Int.: 10 UN');
  });
});
