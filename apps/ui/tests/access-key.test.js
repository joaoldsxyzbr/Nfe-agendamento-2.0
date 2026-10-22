import { describe, expect, it } from 'vitest';
import { validateAccessKey } from '../src/nfe/access-key';

const VALID_NUMERIC_KEY = '42260812345678000123550010000012341000012342';
const VALID_ALPHANUMERIC_KEY = '41260612ABC34501DE35550010000001231876543214';
const VALID_NFCE_KEY = '42260812345678000123650010000012341000012345';

describe('validateAccessKey', () => {
    it('accepts the legacy numeric 44-character NF-e key', () => {
        expect(validateAccessKey(VALID_NUMERIC_KEY)).toEqual({
            valid: true,
            value: VALID_NUMERIC_KEY,
            uf: '42',
            model: '55',
            modelName: 'NF-e',
        });
    });

    it('accepts and normalizes an official alphanumeric CNPJ NF-e key', () => {
        expect(validateAccessKey(VALID_ALPHANUMERIC_KEY.toLowerCase())).toEqual({
            valid: true,
            value: VALID_ALPHANUMERIC_KEY,
            uf: '41',
            model: '55',
            modelName: 'NF-e',
        });
    });

    it('accepts NFC-e model 65 key by default', () => {
        const result = validateAccessKey(VALID_NFCE_KEY);
        expect(result.valid).toBe(true);
        expect(result.model).toBe('65');
        expect(result.modelName).toBe('NFC-e');
    });

    it('rejects NFC-e when restricted to NF-e only', () => {
        expect(validateAccessKey(VALID_NFCE_KEY, { allowModels: ['55'] })).toEqual({
            valid: false,
            error: 'Este sistema aceita somente NF-e (55). Modelo 65 não suportado.',
        });
    });

    it.each([
        ['', 'A chave da NF-e deve conter 44 caracteres.'],
        ['4226081234567800012355001000001234100001234', 'A chave da NF-e deve conter 44 caracteres.'],
        ['4226081234567800012355001000001234100001234X', 'A chave da NF-e não está no formato oficial (A-Z e 0-9).'],
        ['42260812345678000123550010000012341000012343', 'Dígito verificador da chave NF-e inválido.'],
        ['41260612ABC34501DE35550010000001231876543215', 'Dígito verificador da chave NF-e inválido.'],
    ])('rejects invalid key %s', (value, error) => {
        expect(validateAccessKey(value)).toEqual({ valid: false, error });
    });

    it('rejects invalid UF', () => {
        const badUfKey = '99260812345678000123550010000012341000012342';
        const result = validateAccessKey(badUfKey);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('UF');
    });
});
