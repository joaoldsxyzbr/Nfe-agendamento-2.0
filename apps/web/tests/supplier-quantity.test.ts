import { describe, expect, it } from 'vitest';

describe('Souza Cruz quantity presentation', () => {
  it('converts fiscal quantities to internal units for Souza Cruz', async () => {
    const { resolveSupplierInternalQuantity } = await import('../src/nfe/supplier-quantity');

    expect(resolveSupplierInternalQuantity({ emitterName: 'SOUZA CRUZ LTDA', quantity: 0.2 })).toBe(10);
    expect(resolveSupplierInternalQuantity({ emitterName: 'Souza Cruz', quantity: 0.4 })).toBe(20);
    expect(resolveSupplierInternalQuantity({ emitterName: 'SOUZA CRUZ S A', quantity: 1 })).toBe(50);
  });

  it('does not apply the conversion to another supplier', async () => {
    const { resolveSupplierInternalQuantity } = await import('../src/nfe/supplier-quantity');

    expect(resolveSupplierInternalQuantity({ emitterName: 'OUTRO FORNECEDOR LTDA', quantity: 0.2 })).toBeNull();
  });

  it('refuses invalid or non-integral conversions instead of guessing', async () => {
    const { resolveSupplierInternalQuantity } = await import('../src/nfe/supplier-quantity');

    expect(resolveSupplierInternalQuantity({ emitterName: 'SOUZA CRUZ LTDA', quantity: 0 })).toBeNull();
    expect(resolveSupplierInternalQuantity({ emitterName: 'SOUZA CRUZ LTDA', quantity: -0.2 })).toBeNull();
    expect(resolveSupplierInternalQuantity({ emitterName: 'SOUZA CRUZ LTDA', quantity: 0.333 })).toBeNull();
  });
});
