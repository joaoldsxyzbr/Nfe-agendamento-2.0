import {
  GREEN_SUPPLIER_CATALOG,
  resolveSupplierRuleForPresentation,
  type SupplierCatalogItem,
} from './supplier-rules';

export type ProductPresentation = Readonly<{
  sourceCode: string;
  internalCode: string;
}>;

export type SupplierProductInput = Readonly<{
  supplierRuleId?: string | null;
  emitterName?: string | null;
  xProd?: string | null;
  cProd?: string | null;
}>;

export type SupplierProductSummary = Readonly<{
  applies: boolean;
  total: number;
  mapped: number;
  unmapped: number;
  unknownProducts: readonly Readonly<{ cProd: string; xProd: string }>[];
}>;

export const SUPPLIER_PRODUCT_CATALOG = GREEN_SUPPLIER_CATALOG;

export function normalizeSupplierProductName(value: unknown): string {
  const normalized = String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return normalized.replace(/^VERDURAS(?:\s+|$)/, '').trim();
}

function buildAliasIndex(catalog: readonly SupplierCatalogItem[]): Readonly<Record<string, string>> {
  const aliases: Record<string, string> = {};

  for (const item of catalog) {
    const internalCode = String(item?.internalCode ?? '').trim();
    if (!internalCode) {
      throw new Error('Produto do catálogo sem código interno.');
    }

    for (const rawAlias of item?.aliases ?? []) {
      const alias = normalizeSupplierProductName(rawAlias);
      if (!alias) {
        throw new Error(`Alias vazio no código interno ${internalCode}.`);
      }

      const existingCode = aliases[alias];
      if (existingCode && existingCode !== internalCode) {
        throw new Error(`Alias conflitante ${alias}: códigos internos ${existingCode} e ${internalCode}.`);
      }

      aliases[alias] = internalCode;
    }
  }

  return Object.freeze(aliases);
}

export function validateSupplierProductCatalog(
  catalog: readonly SupplierCatalogItem[] = SUPPLIER_PRODUCT_CATALOG,
): true {
  buildAliasIndex(catalog);
  return true;
}

const catalogIndexes = new Map<readonly SupplierCatalogItem[], Readonly<Record<string, string>>>();

function aliasIndexFor(catalog: readonly SupplierCatalogItem[]): Readonly<Record<string, string>> {
  const cached = catalogIndexes.get(catalog);
  if (cached) return cached;
  const index = buildAliasIndex(catalog);
  catalogIndexes.set(catalog, index);
  return index;
}

export function isSupplierProductCatalogEmitter(input: Readonly<{
  supplierRuleId?: unknown;
  emitterName?: unknown;
}>): boolean {
  return Boolean(resolveSupplierRuleForPresentation(input)?.productCatalog?.length);
}

export function resolveSupplierProduct(input: SupplierProductInput): ProductPresentation {
  const sourceCode = String(input.cProd ?? '');
  const supplier = resolveSupplierRuleForPresentation({
    supplierRuleId: input.supplierRuleId,
    emitterName: input.emitterName,
  });
  const catalog = supplier?.productCatalog;
  if (!catalog?.length) {
    return Object.freeze({ sourceCode, internalCode: '' });
  }

  const productName = normalizeSupplierProductName(input.xProd);
  return Object.freeze({
    sourceCode,
    internalCode: aliasIndexFor(catalog)[productName] ?? '',
  });
}

export function summarizeSupplierProducts(input: Readonly<{
  supplierRuleId?: string | null;
  emitterName?: string | null;
  products?: readonly Readonly<{ cProd?: string | null; xProd?: string | null }>[] | null;
}>): SupplierProductSummary {
  const products = Array.isArray(input.products) ? input.products : [];

  if (!isSupplierProductCatalogEmitter({
    supplierRuleId: input.supplierRuleId,
    emitterName: input.emitterName,
  })) {
    return Object.freeze({
      applies: false,
      total: products.length,
      mapped: 0,
      unmapped: 0,
      unknownProducts: Object.freeze([]),
    });
  }

  let mapped = 0;
  const unknownProducts: Readonly<{ cProd: string; xProd: string }>[] = [];

  for (const product of products) {
    const result = resolveSupplierProduct({
      supplierRuleId: input.supplierRuleId,
      emitterName: input.emitterName,
      xProd: product?.xProd,
      cProd: product?.cProd,
    });

    if (result.internalCode) {
      mapped += 1;
    } else {
      unknownProducts.push(Object.freeze({
        cProd: String(product?.cProd ?? ''),
        xProd: String(product?.xProd ?? ''),
      }));
    }
  }

  return Object.freeze({
    applies: true,
    total: products.length,
    mapped,
    unmapped: unknownProducts.length,
    unknownProducts: Object.freeze(unknownProducts),
  });
}

// Compatibilidade temporária até o renderer migrar para os nomes genéricos.
export const resolveFernandoKleinProduct = resolveSupplierProduct;
