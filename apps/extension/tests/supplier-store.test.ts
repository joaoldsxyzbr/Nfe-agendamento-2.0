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

  it('accepts legacy case-insensitive property names and canonicalizes the result', async () => {
    const { analyzeSupplierConfig } = await import('../src/supplier-store');

    const analysis = analyzeSupplierConfig({
      Version: 1,
      Suppliers: [
        {
          Id: ' fernando-klein ',
          TaxIds: ['12.345.678/0001-95'],
        },
      ],
    });

    expect(analysis.usedLegacyCasing).toBe(true);
    expect(analysis.supplierCount).toBe(1);
    expect(analysis.taxIdCount).toBe(1);
    expect(analysis.config).toEqual({
      version: 1,
      suppliers: [
        {
          id: 'fernando-klein',
          taxIds: ['12345678000195'],
        },
      ],
    });
  });

  it('rejects ambiguous keys instead of guessing between canonical and legacy casing', async () => {
    const { validateSupplierConfig } = await import('../src/supplier-store');

    expect(() => validateSupplierConfig({
      version: 1,
      Version: 1,
      suppliers: [],
    })).toThrow('campos ambíguos');

    expect(() => validateSupplierConfig({
      version: 1,
      suppliers: [
        {
          id: 'souza-cruz',
          Id: 'souza-cruz',
          taxIds: ['12.345.678/0001-95'],
        },
      ],
    })).toThrow('campos ambíguos');
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
    })).toThrow('$.version');

    expect(() => validateSupplierConfig({
      version: 1,
      suppliers: [{ id: '', taxIds: ['12345678000195'] }],
    })).toThrow('$.suppliers[0].id');

    expect(() => validateSupplierConfig({
      version: 1,
      suppliers: [{ id: 'souza-cruz', taxIds: [] }],
    })).toThrow('$.suppliers[0].taxIds');

    expect(() => validateSupplierConfig({
      version: 1,
      suppliers: [
        { id: 'souza-cruz', taxIds: ['12.345.678/0001-95'] },
        { id: 'dionisio', taxIds: ['12345678000195'] },
      ],
    })).toThrow('fornecedores diferentes');
  });

  it('persists only validated normalized config and loads invalid storage fail-soft', async () => {
    const stored = new Map<string, unknown>();
    (globalThis as typeof globalThis & { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: stored.get(key) }),
          set: async (value: Record<string, unknown>) => {
            for (const [key, item] of Object.entries(value)) stored.set(key, item);
          },
        },
      },
    };

    const { loadSupplierConfig, saveSupplierConfig } = await import('../src/supplier-store');

    expect(await loadSupplierConfig()).toBeNull();

    await saveSupplierConfig({
      Version: 1,
      Suppliers: [{ Id: ' fernando-klein ', TaxIds: ['12.345.678/0001-95'] }],
    });

    expect(await loadSupplierConfig()).toEqual({
      version: 1,
      suppliers: [{ id: 'fernando-klein', taxIds: ['12345678000195'] }],
    });

    stored.set('supplierRulesV1', { version: 99, suppliers: [] });
    expect(await loadSupplierConfig()).toBeNull();
  });

  it('clears only the local supplier config key', async () => {
    const removed: string[] = [];
    (globalThis as typeof globalThis & { chrome: unknown }).chrome = {
      storage: {
        local: {
          remove: async (key: string) => { removed.push(key); },
        },
      },
    };

    const { clearSupplierConfig } = await import('../src/supplier-store');
    await clearSupplierConfig();

    expect(removed).toEqual(['supplierRulesV1']);
  });
});
