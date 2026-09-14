import { describe, expect, it } from 'vitest';

describe('supplier rules', () => {
  it('keeps supplier identifiers unique and configuration valid', async () => {
    const { SUPPLIER_RULES, validateSupplierRules } = await import('../src/nfe/supplier-rules');

    expect(validateSupplierRules()).toBe(true);
    expect(SUPPLIER_RULES.map((rule) => rule.id)).toEqual([
      'fernando-klein',
      'dionisio',
      'souza-cruz',
    ]);
  });

  it('shares the green catalog between Fernando Klein and Dionisio', async () => {
    const { GREEN_SUPPLIER_CATALOG, resolveSupplierRule } = await import('../src/nfe/supplier-rules');

    expect(GREEN_SUPPLIER_CATALOG).toHaveLength(18);
    expect(resolveSupplierRule('067.277.939-05')?.productCatalog).toBe(GREEN_SUPPLIER_CATALOG);
    expect(resolveSupplierRule('649.433.569-15')?.productCatalog).toBe(GREEN_SUPPLIER_CATALOG);
  });

  it('declares Souza Cruz quantity conversion without hardcoding it in rendering', async () => {
    const { resolveSupplierRule } = await import('../src/nfe/supplier-rules');

    expect(resolveSupplierRule('33.009.911/0285-72')?.internalQuantity).toEqual({
      multiplier: 50,
      unit: 'UN',
    });
  });
});
