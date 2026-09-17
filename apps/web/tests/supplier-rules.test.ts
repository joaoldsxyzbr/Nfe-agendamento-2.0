import { describe, expect, it } from 'vitest';

describe('supplier rules', () => {
  it('keeps supplier issuer names unique and configuration valid', async () => {
    const { SUPPLIER_RULES, validateSupplierRules } = await import('../src/nfe/supplier-rules');

    expect(validateSupplierRules()).toBe(true);
    expect(SUPPLIER_RULES.map((rule) => rule.id)).toEqual([
      'fernando-klein',
      'dionisio',
      'souza-cruz',
    ]);
    expect(SUPPLIER_RULES.every((rule) => !('taxIds' in rule))).toBe(true);
  });

  it('shares the green catalog between Fernando Klein and Dionisio by issuer name', async () => {
    const { GREEN_SUPPLIER_CATALOG, resolveSupplierRule } = await import('../src/nfe/supplier-rules');

    expect(GREEN_SUPPLIER_CATALOG).toHaveLength(18);
    expect(resolveSupplierRule('FERNANDO KLEIN')?.productCatalog).toBe(GREEN_SUPPLIER_CATALOG);
    expect(resolveSupplierRule('Dionísio')?.productCatalog).toBe(GREEN_SUPPLIER_CATALOG);
    expect(resolveSupplierRule('DIONISIO KOCH')?.productCatalog).toBe(GREEN_SUPPLIER_CATALOG);
  });

  it('prefers supplier id and falls back to normalized issuer name', async () => {
    const { resolveSupplierRuleForPresentation } = await import('../src/nfe/supplier-rules');

    expect(resolveSupplierRuleForPresentation({
      supplierRuleId: 'souza-cruz',
      emitterName: 'FERNANDO KLEIN',
    })?.id).toBe('souza-cruz');

    expect(resolveSupplierRuleForPresentation({
      supplierRuleId: null,
      emitterName: 'FERNANDO KLEIN',
    })?.id).toBe('fernando-klein');

    expect(resolveSupplierRuleForPresentation({
      supplierRuleId: 'unknown-id',
      emitterName: 'DIONISIO',
    })?.id).toBe('dionisio');
  });

  it('declares Souza Cruz quantity conversion without fiscal identifiers in the rule', async () => {
    const { resolveSupplierRule } = await import('../src/nfe/supplier-rules');

    expect(resolveSupplierRule('Souza Cruz Ltda.')?.internalQuantity).toEqual({
      multiplier: 50,
      unit: 'UN',
    });
  });

  it('does not match partial or unrelated issuer names', async () => {
    const { resolveSupplierRule } = await import('../src/nfe/supplier-rules');

    expect(resolveSupplierRule('Fernando')).toBeNull();
    expect(resolveSupplierRule('Fornecedor Souza Cruz Distribuidora')).toBeNull();
    expect(resolveSupplierRule('Outro fornecedor')).toBeNull();
  });
});
