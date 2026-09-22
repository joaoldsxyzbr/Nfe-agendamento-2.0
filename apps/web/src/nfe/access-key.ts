export type AccessKeyValidation =
  | { valid: true; value: string; ufAutor: string }
  | { valid: false; error: string };

const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/;
const NFE_MODEL = '55';

export function validateAccessKey(value: string): AccessKeyValidation {
  const normalized = value.trim().toUpperCase();

  if (normalized.length !== 44) {
    return { valid: false, error: 'A chave da NF-e deve conter 44 caracteres.' };
  }

  if (!ACCESS_KEY_PATTERN.test(normalized)) {
    return {
      valid: false,
      error: 'A chave da NF-e não está no formato oficial (A-Z e 0-9).',
    };
  }

  if (normalized.slice(20, 22) !== NFE_MODEL) {
    return { valid: false, error: 'Este sistema aceita somente NF-e modelo 55.' };
  }

  const checkDigit = calculateCheckDigit(normalized.slice(0, 43));
  if (Number(normalized[43]) !== checkDigit) {
    return { valid: false, error: 'Dígito verificador da chave NF-e inválido.' };
  }

  return {
    valid: true,
    value: normalized,
    ufAutor: normalized.slice(0, 2),
  };
}

function calculateCheckDigit(prefix: string): number {
  let sum = 0;
  let weight = 2;

  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    // NT Conjunta DFe 2025.001: caracteres alfanuméricos usam valor ASCII - 48.
    sum += (prefix.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const digit = 11 - (sum % 11);
  return digit >= 10 ? 0 : digit;
}
