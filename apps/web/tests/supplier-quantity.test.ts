import { describe, expect, it } from 'vitest';

describe('Souza Cruz quantity presentation', () => {
  it('converts fiscal quantities to internal units for Souza Cruz', async () => {
    const { resolveSupplierInternalQuantity } = await import('../src/nfe/supplier-quantity');

    expect(resolveSupplierInternalQuantity({ emitterTaxId: '33.009.911/0285-72', quantity: 0.2 })).toBe(10);
    expect(resolveSupplierInternalQuantity({ emitterTaxId: '33009911028572', quantity: 0.4 })).toBe(20);
    expect(resolveSupplierInternalQuantity({ emitterTaxId: '33.009.911/0285-72', quantity: 1 })).toBe(50);
  });

  it('does not apply the conversion to another supplier', async () => {
    const { resolveSupplierInternalQuantity } = await import('../src/nfe/supplier-quantity');

    expect(resolveSupplierInternalQuantity({ emitterTaxId: '12.345.678/0001-90', quantity: 0.2 })).toBeNull();
  });

  it('refuses invalid or non-integral conversions instead of guessing', async () => {
    const { resolveSupplierInternalQuantity } = await import('../src/nfe/supplier-quantity');

    expect(resolveSupplierInternalQuantity({ emitterTaxId: '33.009.911/0285-72', quantity: 0 })).toBeNull();
    expect(resolveSupplierInternalQuantity({ emitterTaxId: '33.009.911/0285-72', quantity: -0.2 })).toBeNull();
    expect(resolveSupplierInternalQuantity({ emitterTaxId: '33.009.911/0285-72', quantity: 0.333 })).toBeNull();
  });
});
