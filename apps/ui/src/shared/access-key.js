export const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/;

export const NFE_MODEL = '55';
export const NFCE_MODEL = '65';

export const VALID_MODELS = Object.freeze([NFE_MODEL, NFCE_MODEL]);

export const VALID_UFS = Object.freeze([
  '11', '12', '13', '14', '15', '16', '17',
  '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '31', '32', '33', '35',
  '41', '42', '43',
  '50', '51', '52', '53',
]);

export function validateAccessKey(value, options = {}) {
  const { allowModels = VALID_MODELS } = options;
  const normalized = String(value ?? '').trim().toUpperCase();

  if (normalized.length !== 44) {
    return { valid: false, error: 'A chave da NF-e deve conter 44 caracteres.' };
  }

  if (!ACCESS_KEY_PATTERN.test(normalized)) {
    return {
      valid: false,
      error: 'A chave da NF-e não está no formato oficial (A-Z e 0-9).',
    };
  }

  const uf = normalized.slice(0, 2);
  if (!VALID_UFS.includes(uf)) {
    return { valid: false, error: `UF ${uf} não é válida para NF-e.` };
  }

  const model = normalized.slice(20, 22);
  if (!allowModels.includes(model)) {
    const modelNames = allowModels.map((m) => (m === NFE_MODEL ? 'NF-e (55)' : `modelo ${m}`));
    return {
      valid: false,
      error: `Este sistema aceita somente ${modelNames.join(' e ')}. Modelo ${model} não suportado.`,
    };
  }

  const checkDigit = calculateCheckDigit(normalized.slice(0, 43));
  if (Number(normalized[43]) !== checkDigit) {
    return { valid: false, error: 'Dígito verificador da chave NF-e inválido.' };
  }

  return {
    valid: true,
    value: normalized,
    uf,
    model,
    modelName: model === NFE_MODEL ? 'NF-e' : 'NFC-e',
  };
}

function calculateCheckDigit(prefix) {
  let sum = 0;
  let weight = 2;
  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    sum += (prefix.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const digit = 11 - (sum % 11);
  return digit >= 10 ? 0 : digit;
}

export function generateAccessKey({ uf, year, month, cnpj, model = NFE_MODEL, series, number }) {
  if (!VALID_UFS.includes(uf)) throw new Error(`UF inválida: ${uf}`);
  if (!VALID_MODELS.includes(model)) throw new Error(`Modelo inválido: ${model}`);
  const aa = String(year).slice(-2).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  const cnpjPadded = String(cnpj).replace(/\D/g, '').padStart(14, '0');
  const seriesPadded = String(series).padStart(3, '0');
  const numberPadded = String(number).padStart(9, '0');
  const random = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const tpEmis = '1';
  const prefix = `${uf}${aa}${mm}${cnpjPadded}${model}${seriesPadded}${numberPadded}${tpEmis}${random}`;
  const checkDigit = calculateCheckDigit(prefix);
  return `${prefix}${checkDigit}`;
}
