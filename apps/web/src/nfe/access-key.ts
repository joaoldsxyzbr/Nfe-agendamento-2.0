export type AccessKeyValidation =
  | { valid: true; value: string; ufAutor: string }
  | { valid: false; error: string };

export function validateAccessKey(value: string): AccessKeyValidation {
  if (value.length !== 44) {
    return { valid: false, error: 'A chave da NF-e deve conter 44 dígitos.' };
  }

  if (!/^\d{44}$/.test(value)) {
    return { valid: false, error: 'A chave da NF-e deve conter somente números.' };
  }

  let sum = 0;
  let weight = 2;
  for (let index = 42; index >= 0; index -= 1) {
    sum += Number(value[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  let checkDigit = 11 - (sum % 11);
  if (checkDigit >= 10) checkDigit = 0;

  if (Number(value[43]) !== checkDigit) {
    return { valid: false, error: 'Dígito verificador da chave NF-e inválido.' };
  }

  return {
    valid: true,
    value,
    ufAutor: value.slice(0, 2),
  };
}
