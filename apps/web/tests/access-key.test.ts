import { describe, expect, it } from 'vitest';

const VALID_NUMERIC_KEY = '42260812345678000123550010000012341000012342';
const VALID_ALPHANUMERIC_KEY = '41260612ABC34501DE35550010000001231876543214';
const VALID_NFCE_KEY = '42260812345678000123650010000012341000012345';

describe('validateAccessKey', () => {
  it('accepts the legacy numeric 44-character NF-e key', async () => {
    await expect(
      import('../src/nfe/access-key').then(({ validateAccessKey }) => validateAccessKey(VALID_NUMERIC_KEY)),
    ).resolves.toEqual({
      valid: true,
      value: VALID_NUMERIC_KEY,
      ufAutor: '42',
    });
  });

  it('accepts and normalizes an official alphanumeric CNPJ NF-e key', async () => {
    await expect(
      import('../src/nfe/access-key').then(({ validateAccessKey }) => validateAccessKey(VALID_ALPHANUMERIC_KEY.toLowerCase())),
    ).resolves.toEqual({
      valid: true,
      value: VALID_ALPHANUMERIC_KEY,
      ufAutor: '41',
    });
  });

  it('rejects a structurally valid NFC-e model 65 key', async () => {
    await expect(
      import('../src/nfe/access-key').then(({ validateAccessKey }) => validateAccessKey(VALID_NFCE_KEY)),
    ).resolves.toEqual({ valid: false, error: 'Este sistema aceita somente NF-e modelo 55.' });
  });

  it.each([
    ['', 'A chave da NF-e deve conter 44 caracteres.'],
    ['4226081234567800012355001000001234100001234', 'A chave da NF-e deve conter 44 caracteres.'],
    ['4226081234567800012355001000001234100001234X', 'A chave da NF-e não está no formato oficial (A-Z e 0-9).'],
    ['42260812345678000123550010000012341000012343', 'Dígito verificador da chave NF-e inválido.'],
    ['41260612ABC34501DE35550010000001231876543215', 'Dígito verificador da chave NF-e inválido.'],
  ])('rejects invalid key %s', async (value, error) => {
    await expect(
      import('../src/nfe/access-key').then(({ validateAccessKey }) => validateAccessKey(value)),
    ).resolves.toEqual({ valid: false, error });
  });
});
