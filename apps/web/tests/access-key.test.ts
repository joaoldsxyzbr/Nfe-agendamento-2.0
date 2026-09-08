import { describe, expect, it } from 'vitest';

const VALID_KEY = '42260812345678000123550010000012341000012342';

describe('validateAccessKey', () => {
  it('accepts a valid 44 digit NF-e key and exposes its UF author', async () => {
    await expect(
      import('../src/nfe/access-key').then(({ validateAccessKey }) => validateAccessKey(VALID_KEY)),
    ).resolves.toEqual({
      valid: true,
      value: VALID_KEY,
      ufAutor: '42',
    });
  });

  it.each([
    ['', 'A chave da NF-e deve conter 44 dígitos.'],
    ['4226081234567800012355001000001234100001234', 'A chave da NF-e deve conter 44 dígitos.'],
    ['4226081234567800012355001000001234100001234X', 'A chave da NF-e deve conter somente números.'],
    ['42260812345678000123550010000012341000012343', 'Dígito verificador da chave NF-e inválido.'],
  ])('rejects invalid key %s', async (value, error) => {
    await expect(
      import('../src/nfe/access-key').then(({ validateAccessKey }) => validateAccessKey(value)),
    ).resolves.toEqual({ valid: false, error });
  });
});
