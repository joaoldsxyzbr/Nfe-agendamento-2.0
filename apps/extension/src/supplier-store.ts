declare const chrome: any;

const SUPPLIER_CONFIG_KEY = 'supplierRulesV1';

export type LocalSupplierEntry = Readonly<{
  id: string;
  taxIds: readonly string[];
}>;

export type LocalSupplierConfig = Readonly<{
  version: 1;
  suppliers: readonly LocalSupplierEntry[];
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

export function validateSupplierConfig(value: unknown): LocalSupplierConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Configuração de fornecedores inválida.');
  }

  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Array.isArray(input.suppliers)) {
    throw new Error('Versão da configuração de fornecedores inválida.');
  }

  const seen = new Map<string, string>();
  const suppliers: LocalSupplierEntry[] = input.suppliers.map((rawSupplier) => {
    if (!rawSupplier || typeof rawSupplier !== 'object' || Array.isArray(rawSupplier)) {
      throw new Error('Fornecedor inválido.');
    }

    const supplier = rawSupplier as Record<string, unknown>;
    const id = typeof supplier.id === 'string' ? supplier.id.trim() : '';
    if (!id || !Array.isArray(supplier.taxIds) || supplier.taxIds.length === 0) {
      throw new Error('Fornecedor incompleto.');
    }

    const taxIds = supplier.taxIds.map((rawTaxId) => {
      if (typeof rawTaxId !== 'string') throw new Error('Identificador fiscal inválido.');
      const normalized = normalizeTaxId(rawTaxId);
      if (!normalized) throw new Error('Identificador fiscal inválido.');

      const existing = seen.get(normalized);
      if (existing && existing !== id) {
        throw new Error('Identificador fiscal configurado para fornecedores diferentes.');
      }
      seen.set(normalized, id);
      return normalized;
    });

    return Object.freeze({ id, taxIds: Object.freeze(taxIds) });
  });

  return Object.freeze({
    version: 1,
    suppliers: Object.freeze(suppliers),
  });
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
