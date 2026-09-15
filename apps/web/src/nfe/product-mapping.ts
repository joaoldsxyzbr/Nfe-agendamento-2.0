import {
  GREEN_SUPPLIER_CATALOG,
  normalizeSupplierName,
  resolveSupplierRule,
  type SupplierCatalogItem,
} from './supplier-rules';

export type FernandoKleinCatalogItem = SupplierCatalogItem;

export type ProductPresentation = Readonly<{
  sourceCode: string;
  internalCode: string;
}>;

export type FernandoKleinProductInput = Readonly<{
  emitterName?: string | null;
  xProd?: string | null;
  cProd?: string | null;
}>;

export type FernandoKleinSummary = Readonly<{
  applies: boolean;
  total: number;
  mapped: number;
  unmapped: number;
  unknownProducts: readonly Readonly<{ cProd: string; xProd: string }>[];
}>;

export const FERNANDO_KLEIN_CATALOG = GREEN_SUPPLIER_CATALOG;

export function normalizeFernandoKleinSupplierName(value: unknown): string {
  return normalizeSupplierName(value);
}

export function normalizeFernandoKleinProductName(value: unknown): string {
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

function buildAliasIndex(catalog: readonly FernandoKleinCatalogItem[]): Readonly<Record<string, string>> {
  const aliases: Record<string, string> = {};

  for (const item of catalog) {
    const internalCode = String(item?.internalCode ?? '').trim();
    if (!internalCode) {
      throw new Error('Produto do catálogo sem código interno.');
    }

    for (const rawAlias of item?.aliases ?? []) {
      const alias = normalizeFernandoKleinProductName(rawAlias);
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

export function validateFernandoKleinCatalog(
  catalog: readonly FernandoKleinCatalogItem[] = FERNANDO_KLEIN_CATALOG,
): true {
  buildAliasIndex(catalog);
  return true;
}

const catalogIndexes = new Map<readonly FernandoKleinCatalogItem[], Readonly<Record<string, string>>>();

function aliasIndexFor(catalog: readonly FernandoKleinCatalogItem[]): Readonly<Record<string, string>> {
  const cached = catalogIndexes.get(catalog);
  if (cached) return cached;
  const index = buildAliasIndex(catalog);
  catalogIndexes.set(catalog, index);
  return index;
}

export function isFernandoKleinEmitter(emitterName: unknown): boolean {
  return Boolean(resolveSupplierRule(emitterName)?.productCatalog?.length);
}

export function resolveFernandoKleinProduct(input: FernandoKleinProductInput): ProductPresentation {
  const sourceCode = String(input.cProd ?? '');
  const supplier = resolveSupplierRule(input.emitterName);
  const catalog = supplier?.productCatalog;
  if (!catalog?.length) {
    return Object.freeze({ sourceCode, internalCode: '' });
  }

  const productName = normalizeFernandoKleinProductName(input.xProd);
  return Object.freeze({
    sourceCode,
    internalCode: aliasIndexFor(catalog)[productName] ?? '',
  });
}

export function summarizeFernandoKleinProducts(input: Readonly<{
  emitterName?: string | null;
  products?: readonly Readonly<{ cProd?: string | null; xProd?: string | null }>[] | null;
}>): FernandoKleinSummary {
  const products = Array.isArray(input.products) ? input.products : [];

  if (!isFernandoKleinEmitter(input.emitterName)) {
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
    const result = resolveFernandoKleinProduct({
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
