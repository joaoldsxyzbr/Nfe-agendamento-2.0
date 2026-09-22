import { describe, expect, it } from 'vitest';

describe('fiscal identity config', () => {
  it('normalizes and validates the configured CNPJ locally', async () => {
    const { normalizeFiscalCnpj } = await import('../src/fiscal-config');
    expect(normalizeFiscalCnpj('12.345.678/0001-95')).toBe('12345678000195');
    expect(normalizeFiscalCnpj('12.345.678/0001-94')).toBeNull();
    expect(normalizeFiscalCnpj('11.111.111/1111-11')).toBeNull();
  });
});
