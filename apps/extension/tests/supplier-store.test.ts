import { describe, expect, it } from 'vitest';

describe('local supplier store', () => {
  it('normalizes CPF, numeric CNPJ and alphanumeric CNPJ like the legacy Bridge', async () => {
    const { normalizeTaxId } = await import('../src/supplier-store');

    expect(normalizeTaxId('123.456.789-01')).toBe('12345678901');
    expect(normalizeTaxId('12.345.678/0001-95')).toBe('12345678000195');
    expect(normalizeTaxId('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('rejects invalid tax identifier shapes and symbols', async () => {
    const { normalizeTaxId } = await import('../src/supplier-store');

    expect(normalizeTaxId('ABC45678901')).toBeNull();
    expect(normalizeTaxId('1234567890')).toBeNull();
    expect(normalizeTaxId('123456789012345')).toBeNull();
    expect(normalizeTaxId('12.ABC.678/0001-9Z')).toBeNull();
    expect(normalizeTaxId('12.ABC.345/01DE#35')).toBeNull();
    expect(normalizeTaxId('')).toBeNull();
  });

  it('validates config and resolves any registered identifier for one supplier', async () => {
    const { resolveSupplierFromConfig, validateSupplierConfig } = await import('../src/supplier-store');
    const config = validateSupplierConfig({
      version: 1,
      suppliers: [
        {
          id: 'souza-cruz',
          taxIds: ['12.345.678/0001-95', '98.765.ABC/0001-35'],
        },
      ],
    });

    expect(resolveSupplierFromConfig(config, '12345678000195')).toBe('souza-cruz');
    expect(resolveSupplierFromConfig(config, '98.765.abc/0001-35')).toBe('souza-cruz');
    expect(resolveSupplierFromConfig(config, '11.111.111/1111-11')).toBeNull();
    expect(resolveSupplierFromConfig(null, '12345678000195')).toBeNull();
  });

  it('rejects incomplete and conflicting configs instead of guessing', async () => {
    const { validateSupplierConfig } = await import('../src/supplier-store');

    expect(() => validateSupplierConfig({
      version: 2,
      suppliers: [],
    })).toThrow();

    expect(() => validateSupplierConfig({
      version: 1,
      suppliers: [{ id: '', taxIds: ['12345678000195'] }],
    })).toThrow();

    expect(() => validateSupplierConfig({
      version: 1,
      suppliers: [{ id: 'souza-cruz', taxIds: [] }],
    })).toThrow();

    expect(() => validateSupplierConfig({
      version: 1,
      suppliers: [
        { id: 'souza-cruz', taxIds: ['12.345.678/0001-95'] },
        { id: 'dionisio', taxIds: ['12345678000195'] },
      ],
    })).toThrow();
  });
});
