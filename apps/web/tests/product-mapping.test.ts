import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fixture = readFileSync(new URL('./fixtures/fernando-klein-full.xml', import.meta.url), 'utf8');
const expectedCodes = [
  '73457', '104128', '104129', '30228', '104130', '104109', '104108', '104106', '104113',
  '104107', '104104', '104110', '104115', '104114', '104111', '104112', '104105',
];

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function parseProducts(xml: string): Array<{ cProd: string; xProd: string }> {
  return [...xml.matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/gi)].map((match) => ({
    cProd: tag(match[1] ?? '', 'cProd'),
    xProd: tag(match[1] ?? '', 'xProd'),
  }));
}

describe('supplier product mapping', () => {
  it('keeps the shared 18-product catalog valid', async () => {
    const mapping = await import('../src/nfe/product-mapping');

    expect(mapping.SUPPLIER_PRODUCT_CATALOG).toHaveLength(18);
    expect(mapping.validateSupplierProductCatalog()).toBe(true);
  });

  it('maps the 17 known fixture products and preserves original cProd', async () => {
    const { resolveSupplierProduct } = await import('../src/nfe/product-mapping');
    const emitterName = tag(tag(fixture, 'emit'), 'xNome');
    const products = parseProducts(fixture);

    expect(products).toHaveLength(18);
    products.slice(0, 17).forEach((product, index) => {
      expect(resolveSupplierProduct({ emitterName, ...product })).toEqual({
        sourceCode: product.cProd,
        internalCode: expectedCodes[index],
      });
    });

    expect(resolveSupplierProduct({ emitterName, ...products[17]! })).toEqual({
      sourceCode: 'FK999',
      internalCode: '',
    });
  });

  it('uses supplierRuleId even when the issuer name does not match', async () => {
    const { resolveSupplierProduct } = await import('../src/nfe/product-mapping');

    expect(resolveSupplierProduct({
      supplierRuleId: 'dionisio',
      emitterName: 'NOME QUE NAO CASA',
      xProd: 'RÚCULA',
      cProd: 'SRC',
    })).toEqual({ sourceCode: 'SRC', internalCode: '104111' });
  });

  it('applies the full shared catalog to the additional supplier', async () => {
    const { resolveSupplierProduct } = await import('../src/nfe/product-mapping');
    const resolve = (xProd: string) => resolveSupplierProduct({
      emitterName: 'DIONISIO',
      xProd,
      cProd: 'SRC',
    });

    expect(resolve('ALFACE').internalCode).toBe('73457');
    expect(resolve('RÚCULA').internalCode).toBe('104111');
    expect(resolve('ALECRIM').internalCode).toBe('104144');
  });

  it('maps alecrim for every configured supplier', async () => {
    const { resolveSupplierProduct } = await import('../src/nfe/product-mapping');

    for (const emitterName of ['FERNANDO KLEIN', 'DIONISIO']) {
      expect(resolveSupplierProduct({
        emitterName,
        xProd: 'ALECRIM',
        cProd: 'SRC-ALECRIM',
      })).toEqual({
        sourceCode: 'SRC-ALECRIM',
        internalCode: '104144',
      });
    }
  });

  it('maps COUVE FOLHA as COUVE for every configured supplier', async () => {
    const { resolveSupplierProduct } = await import('../src/nfe/product-mapping');

    for (const emitterName of ['FERNANDO KLEIN', 'DIONISIO']) {
      expect(resolveSupplierProduct({
        emitterName,
        xProd: 'COUVE FOLHA',
        cProd: 'SRC-COUVE',
      })).toEqual({
        sourceCode: 'SRC-COUVE',
        internalCode: '104107',
      });
    }
  });

  it('summarizes unknown products without guessing', async () => {
    const { summarizeSupplierProducts } = await import('../src/nfe/product-mapping');
    const emitterName = tag(tag(fixture, 'emit'), 'xNome');
    const products = parseProducts(fixture);

    expect(summarizeSupplierProducts({ emitterName, products })).toEqual({
      applies: true,
      total: 18,
      mapped: 17,
      unmapped: 1,
      unknownProducts: [{ cProd: 'FK999', xProd: 'PRODUTO NOVO SEM MAPA' }],
    });
  });

  it('preserves aliases, accents and VERDURAS prefix behavior', async () => {
    const { resolveSupplierProduct } = await import('../src/nfe/product-mapping');
    const resolve = (xProd: string) => resolveSupplierProduct({
      emitterName: 'FERNANDO KLEIN',
      xProd,
      cProd: 'SRC',
    });

    for (const variant of ['RÚCULA', 'rucula', ' VERDURAS - RÚCULA ', 'VERDURAS: RUCULA']) {
      expect(resolve(variant).internalCode).toBe('104111');
    }
    expect(resolve('CEBOLA').internalCode).toBe('104106');
    expect(resolve('CEBOLINHA').internalCode).toBe('104106');
    expect(resolve('COUVE').internalCode).toBe('104107');
    expect(resolve('COUVE FOLHA').internalCode).toBe('104107');
    expect(resolve('SALSA').internalCode).toBe('104105');
    expect(resolve('SALSINHA').internalCode).toBe('104105');
  });

  it('never applies the mapping to another emitter', async () => {
    const { resolveSupplierProduct, summarizeSupplierProducts } = await import('../src/nfe/product-mapping');
    const products = [{ cProd: 'OUT001', xProd: 'ALFACE' }];

    expect(resolveSupplierProduct({
      emitterName: 'OUTRO FORNECEDOR LTDA',
      ...products[0]!,
    })).toEqual({ sourceCode: 'OUT001', internalCode: '' });

    expect(summarizeSupplierProducts({ emitterName: 'OUTRO FORNECEDOR LTDA', products })).toEqual({
      applies: false,
      total: 1,
      mapped: 0,
      unmapped: 0,
      unknownProducts: [],
    });
  });

  it('rejects aliases that conflict after normalization', async () => {
    const { validateSupplierProductCatalog } = await import('../src/nfe/product-mapping');

    expect(() => validateSupplierProductCatalog([
      { internalCode: '1', name: 'A', aliases: ['ALFACE'] },
      { internalCode: '2', name: 'B', aliases: [' alface '] },
    ])).toThrow('Alias conflitante ALFACE');
  });
});
