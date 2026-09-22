declare const chrome: any;

const SUPPLIER_CONFIG_KEY = 'supplierRulesV1';

type JsonObject = Record<string, unknown>;

export type LocalSupplierEntry = Readonly<{
  id: string;
  taxIds: readonly string[];
}>;

export type LocalSupplierConfig = Readonly<{
  version: 1;
  suppliers: readonly LocalSupplierEntry[];
}>;

export type SupplierConfigAnalysis = Readonly<{
  config: LocalSupplierConfig;
  usedLegacyCasing: boolean;
  supplierCount: number;
  taxIdCount: number;
}>;

export function normalizeTaxId(value: string): string | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if ([...raw].some((character) =>
    !(/[A-Z0-9]/.test(character) || /\s/.test(character) || character === '.' || character === '/' || character === '-')
  )) {
    return null;
  }

  const normalized = [...raw].filter((character) => /[A-Z0-9]/.test(character)).join('');
  if (/^[0-9]{11}$/.test(normalized)) return normalized;
  if (/^[A-Z0-9]{12}[0-9]{2}$/.test(normalized)) return normalized;
  return null;
}

export function analyzeSupplierConfig(value: unknown): SupplierConfigAnalysis {
  if (!isRecord(value)) {
    throw new Error('Raiz inválida: esperado objeto JSON.');
  }

  const versionField = readKeyCaseInsensitive(value, 'version', '$');
  const suppliersField = readKeyCaseInsensitive(value, 'suppliers', '$');

  if (versionField.value !== 1) {
    throw new Error('$.version inválido: esperado número 1.');
  }
  if (!Array.isArray(suppliersField.value)) {
    throw new Error('$.suppliers inválido: esperado array.');
  }

  let usedLegacyCasing = versionField.usedLegacyCasing || suppliersField.usedLegacyCasing;
  const seen = new Map<string, string>();
  let taxIdCount = 0;

  const suppliers: LocalSupplierEntry[] = suppliersField.value.map((rawSupplier, supplierIndex) => {
    const supplierPath = `$.suppliers[${supplierIndex}]`;
    if (!isRecord(rawSupplier)) {
      throw new Error(`${supplierPath} inválido: esperado objeto.`);
    }

    const idField = readKeyCaseInsensitive(rawSupplier, 'id', supplierPath);
    const taxIdsField = readKeyCaseInsensitive(rawSupplier, 'taxIds', supplierPath);
    usedLegacyCasing ||= idField.usedLegacyCasing || taxIdsField.usedLegacyCasing;

    const id = typeof idField.value === 'string' ? idField.value.trim() : '';
    if (!id) {
      throw new Error(`${supplierPath}.id inválido: esperado texto não vazio.`);
    }
    if (!Array.isArray(taxIdsField.value) || taxIdsField.value.length === 0) {
      throw new Error(`${supplierPath}.taxIds inválido: esperado array com ao menos um identificador.`);
    }

    const taxIds = taxIdsField.value.map((rawTaxId, taxIdIndex) => {
      const taxIdPath = `${supplierPath}.taxIds[${taxIdIndex}]`;
      if (typeof rawTaxId !== 'string') {
        throw new Error(`${taxIdPath} inválido: esperado texto.`);
      }

      const normalized = normalizeTaxId(rawTaxId);
      if (!normalized) {
        throw new Error(`${taxIdPath} inválido: CPF/CNPJ fora do formato aceito.`);
      }

      const existing = seen.get(normalized);
      if (existing && existing !== id) {
        throw new Error('Identificador fiscal configurado para fornecedores diferentes.');
      }

      seen.set(normalized, id);
      taxIdCount += 1;
      return normalized;
    });

    return Object.freeze({ id, taxIds: Object.freeze(taxIds) });
  });

  const config = Object.freeze({
    version: 1 as const,
    suppliers: Object.freeze(suppliers),
  });

  return Object.freeze({
    config,
    usedLegacyCasing,
    supplierCount: suppliers.length,
    taxIdCount,
  });
}

export function validateSupplierConfig(value: unknown): LocalSupplierConfig {
  return analyzeSupplierConfig(value).config;
}

export function resolveSupplierFromConfig(
  config: LocalSupplierConfig | null,
  taxId: string,
): string | null {
  if (!config) return null;
  const normalized = normalizeTaxId(taxId);
  if (!normalized) return null;

  for (const supplier of config.suppliers) {
    if (supplier.taxIds.includes(normalized)) return supplier.id;
  }
  return null;
}

export async function loadSupplierConfig(): Promise<LocalSupplierConfig | null> {
  try {
    const stored = await chrome.storage.local.get(SUPPLIER_CONFIG_KEY);
    const value = stored?.[SUPPLIER_CONFIG_KEY];
    if (value === undefined) return null;
    return validateSupplierConfig(value);
  } catch {
    return null;
  }
}

export async function saveSupplierConfig(config: unknown): Promise<void> {
  const validated = validateSupplierConfig(config);
  await chrome.storage.local.set({ [SUPPLIER_CONFIG_KEY]: validated });
}

export async function clearSupplierConfig(): Promise<void> {
  await chrome.storage.local.remove(SUPPLIER_CONFIG_KEY);
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readKeyCaseInsensitive(
  object: JsonObject,
  expected: string,
  path: string,
): Readonly<{ value: unknown; usedLegacyCasing: boolean }> {
  const matches = Object.keys(object).filter((key) => key.toLowerCase() === expected.toLowerCase());

  if (matches.length > 1) {
    throw new Error(`${path} contém campos ambíguos para "${expected}".`);
  }

  if (matches.length === 0) {
    return { value: undefined, usedLegacyCasing: false };
  }

  const actual = matches[0];
  return {
    value: object[actual],
    usedLegacyCasing: actual !== expected,
  };
}
