import { describe, expect, it } from 'vitest';
import {
  validateAccessKey,
  ACCESS_KEY_PATTERN,
  NFE_MODEL,
  NFCE_MODEL,
  VALID_MODELS,
  VALID_UFS,
  generateAccessKey,
} from '../src/shared/access-key.js';

const VALID_NFE_KEY = '35260812345678000195550010000000011000000018';
const VALID_NFCE_KEY = '35260812345678000195650010000000011123456780';

describe('shared access-key', () => {
  it('exporta padrão e modelos', () => {
    expect(ACCESS_KEY_PATTERN).toBeInstanceOf(RegExp);
    expect(NFE_MODEL).toBe('55');
    expect(NFCE_MODEL).toBe('65');
    expect(VALID_MODELS).toContain('55');
    expect(VALID_MODELS).toContain('65');
  });

  it('lista UFs válidas brasileiras', () => {
    expect(VALID_UFS).toContain('35');
    expect(VALID_UFS).toContain('33');
    expect(VALID_UFS).toContain('41');
    expect(VALID_UFS.length).toBe(27);
  });

  it('valida NF-e modelo 55 por padrão', () => {
    const result = validateAccessKey(VALID_NFE_KEY);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(VALID_NFE_KEY);
    expect(result.uf).toBe('35');
    expect(result.model).toBe('55');
    expect(result.modelName).toBe('NF-e');
  });

  it('valida NFC-e modelo 65 por padrão', () => {
    const result = validateAccessKey(VALID_NFCE_KEY);
    expect(result.valid).toBe(true);
    expect(result.model).toBe('65');
    expect(result.modelName).toBe('NFC-e');
  });

  it('rejeita modelo não permitido quando restringido', () => {
    const result = validateAccessKey(VALID_NFCE_KEY, { allowModels: ['55'] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('55');
  });

  it('aceita modelo 65 quando explicitamente permitido', () => {
    const result = validateAccessKey(VALID_NFCE_KEY, { allowModels: ['65'] });
    expect(result.valid).toBe(true);
  });

  it('rejeita UF inválida', () => {
    const badKey = '99' + VALID_NFE_KEY.slice(2);
    const result = validateAccessKey(badKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('UF');
  });

  it('rejeita chave com dígito verificador inválido', () => {
    const badKey = VALID_NFE_KEY.slice(0, 43) + '9';
    const result = validateAccessKey(badKey);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Dígito verificador');
  });

  it('rejeita chave com tamanho incorreto', () => {
    const result = validateAccessKey('123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('44 caracteres');
  });

  it('normaliza chave para maiúsculas', () => {
    const result = validateAccessKey(VALID_NFE_KEY.toLowerCase());
    expect(result.valid).toBe(true);
    expect(result.value).toBe(VALID_NFE_KEY);
  });

  it('gera chave válida com generateAccessKey', () => {
    const key = generateAccessKey({
      uf: '35',
      year: 2026,
      month: 8,
      cnpj: '12345678000195',
      model: '55',
      series: 1,
      number: 1,
    });
    expect(key).toHaveLength(44);
    const result = validateAccessKey(key);
    expect(result.valid).toBe(true);
    expect(result.uf).toBe('35');
  });

  it('gera chave NFC-e válida', () => {
    const key = generateAccessKey({
      uf: '33',
      year: 2026,
      month: 1,
      cnpj: '12345678000195',
      model: '65',
      series: 10,
      number: 999,
    });
    const result = validateAccessKey(key);
    expect(result.valid).toBe(true);
    expect(result.model).toBe('65');
  });

  it('rejeita UF inválida no generateAccessKey', () => {
    expect(() => generateAccessKey({
      uf: '99',
      year: 2026,
      month: 1,
      cnpj: '12345678000195',
      model: '55',
      series: 1,
      number: 1,
    })).toThrow('UF inválida');
  });

  it('rejeita modelo inválido no generateAccessKey', () => {
    expect(() => generateAccessKey({
      uf: '35',
      year: 2026,
      month: 1,
      cnpj: '12345678000195',
      model: '99',
      series: 1,
      number: 1,
    })).toThrow('Modelo inválido');
  });
});
