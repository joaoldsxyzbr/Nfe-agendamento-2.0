export type SupplierCatalogItem = Readonly<{
  internalCode: string;
  name: string;
  aliases: readonly string[];
}>;

export type SupplierRule = Readonly<{
  id: string;
  name: string;
  taxIds: readonly string[];
  productCatalog?: readonly SupplierCatalogItem[];
  internalQuantity?: Readonly<{
    multiplier: number;
    unit: string;
  }>;
}>;

export const GREEN_SUPPLIER_CATALOG: readonly SupplierCatalogItem[] = Object.freeze([
  Object.freeze({ internalCode: '73457', name: 'ALFACE CRESPA', aliases: Object.freeze(['ALFACE', 'ALFACE CRESPA']) }),
  Object.freeze({ internalCode: '104128', name: 'ALFACE LISA', aliases: Object.freeze(['ALFACE LISA']) }),
  Object.freeze({ internalCode: '104129', name: 'ALFACE ROXA', aliases: Object.freeze(['ALFACE ROXA']) }),
  Object.freeze({ internalCode: '30228', name: 'ALFACE AMERICANA', aliases: Object.freeze(['ALFACE AMERICANA', 'AMERICANA']) }),
  Object.freeze({ internalCode: '104130', name: 'ALFAVACA', aliases: Object.freeze(['ALFAVACA']) }),
  Object.freeze({ internalCode: '104109', name: 'AGRIAO', aliases: Object.freeze(['AGRIAO']) }),
  Object.freeze({ internalCode: '104108', name: 'BROCOLIS', aliases: Object.freeze(['BROCOLIS']) }),
  Object.freeze({ internalCode: '104106', name: 'CEBOLINHA', aliases: Object.freeze(['CEBOLA', 'CEBOLINHA']) }),
  Object.freeze({ internalCode: '104113', name: 'COENTRO', aliases: Object.freeze(['COENTRO']) }),
  Object.freeze({ internalCode: '104107', name: 'COUVE', aliases: Object.freeze(['COUVE', 'COUVE FOLHA']) }),
  Object.freeze({ internalCode: '104104', name: 'CHICORIA', aliases: Object.freeze(['CHICORIA']) }),
  Object.freeze({ internalCode: '104110', name: 'ESPINAFRE', aliases: Object.freeze(['ESPINAFRE']) }),
  Object.freeze({ internalCode: '104115', name: 'HORTELA', aliases: Object.freeze(['HORTELA']) }),
  Object.freeze({ internalCode: '104114', name: 'MANJERICAO', aliases: Object.freeze(['MANJERICAO']) }),
  Object.freeze({ internalCode: '104111', name: 'RUCULA', aliases: Object.freeze(['RUCULA']) }),
  Object.freeze({ internalCode: '104112', name: 'RADITE', aliases: Object.freeze(['RADITE']) }),
  Object.freeze({ internalCode: '104105', name: 'SALSINHA', aliases: Object.freeze(['SALSA', 'SALSINHA']) }),
  Object.freeze({ internalCode: '104144', name: 'ALECRIM', aliases: Object.freeze(['ALECRIM']) }),
]);

export const SUPPLIER_RULES: readonly SupplierRule[] = Object.freeze([
  Object.freeze({
    id: 'fernando-klein',
    name: 'Fernando Klein',
    taxIds: Object.freeze(['06727793905']),
    productCatalog: GREEN_SUPPLIER_CATALOG,
  }),
  Object.freeze({
    id: 'dionisio',
    name: 'Dionisio',
    taxIds: Object.freeze(['64943356915']),
    productCatalog: GREEN_SUPPLIER_CATALOG,
  }),
  Object.freeze({
    id: 'souza-cruz',
    name: 'Souza Cruz',
    taxIds: Object.freeze(['33009911028572']),
    internalQuantity: Object.freeze({ multiplier: 50, unit: 'UN' }),
  }),
]);

export function normalizeSupplierTaxId(value: unknown): string {
  return String(value ?? '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

export function resolveSupplierRule(emitterTaxId: unknown): SupplierRule | null {
  const normalized = normalizeSupplierTaxId(emitterTaxId);
  if (!normalized) return null;
  return SUPPLIER_RULES.find((rule) => rule.taxIds.includes(normalized)) ?? null;
}

export function validateSupplierRules(rules: readonly SupplierRule[] = SUPPLIER_RULES): true {
  const taxIds = new Map<string, string>();

  for (const rule of rules) {
    if (!rule.id.trim() || !rule.name.trim() || rule.taxIds.length === 0) {
      throw new Error('Regra de fornecedor incompleta.');
    }

    for (const rawTaxId of rule.taxIds) {
      const taxId = normalizeSupplierTaxId(rawTaxId);
      if (!taxId) throw new Error(`Fornecedor ${rule.id} possui CPF/CNPJ vazio.`);
      const existing = taxIds.get(taxId);
      if (existing && existing !== rule.id) {
        throw new Error(`CPF/CNPJ ${taxId} duplicado entre ${existing} e ${rule.id}.`);
      }
      taxIds.set(taxId, rule.id);
    }

    if (rule.internalQuantity && (!Number.isFinite(rule.internalQuantity.multiplier) || rule.internalQuantity.multiplier <= 0)) {
      throw new Error(`Multiplicador inválido no fornecedor ${rule.id}.`);
    }
  }

  return true;
}
