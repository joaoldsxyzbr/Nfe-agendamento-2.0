const FERNANDO_KLEIN_TAX_ID = '06727793905';

export type FernandoKleinCatalogItem = Readonly<{
  internalCode: string;
  name: string;
  aliases: readonly string[];
}>;

export type ProductPresentation = Readonly<{
  sourceCode: string;
  internalCode: string;
}>;

export type FernandoKleinProductInput = Readonly<{
  emitterTaxId?: string | null;
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

export const FERNANDO_KLEIN_CATALOG: readonly FernandoKleinCatalogItem[] = Object.freeze([
  Object.freeze({ internalCode: '73457', name: 'ALFACE CRESPA', aliases: Object.freeze(['ALFACE', 'ALFACE CRESPA']) }),
  Object.freeze({ internalCode: '104128', name: 'ALFACE LISA', aliases: Object.freeze(['ALFACE LISA']) }),
  Object.freeze({ internalCode: '104129', name: 'ALFACE ROXA', aliases: Object.freeze(['ALFACE ROXA']) }),
  Object.freeze({ internalCode: '30228', name: 'ALFACE AMERICANA', aliases: Object.freeze(['ALFACE AMERICANA', 'AMERICANA']) }),
  Object.freeze({ internalCode: '104130', name: 'ALFAVACA', aliases: Object.freeze(['ALFAVACA']) }),
  Object.freeze({ internalCode: '104109', name: 'AGRIAO', aliases: Object.freeze(['AGRIAO']) }),
  Object.freeze({ internalCode: '104108', name: 'BROCOLIS', aliases: Object.freeze(['BROCOLIS']) }),
  Object.freeze({ internalCode: '104106', name: 'CEBOLINHA', aliases: Object.freeze(['CEBOLA', 'CEBOLINHA']) }),
  Object.freeze({ internalCode: '104113', name: 'COENTRO', aliases: Object.freeze(['COENTRO']) }),
  Object.freeze({ internalCode: '104107', name: 'COUVE', aliases: Object.freeze(['COUVE']) }),
  Object.freeze({ internalCode: '104104', name: 'CHICORIA', aliases: Object.freeze(['CHICORIA']) }),
  Object.freeze({ internalCode: '104110', name: 'ESPINAFRE', aliases: Object.freeze(['ESPINAFRE']) }),
  Object.freeze({ internalCode: '104115', name: 'HORTELA', aliases: Object.freeze(['HORTELA']) }),
  Object.freeze({ internalCode: '104114', name: 'MANJERICAO', aliases: Object.freeze(['MANJERICAO']) }),
  Object.freeze({ internalCode: '104111', name: 'RUCULA', aliases: Object.freeze(['RUCULA']) }),
  Object.freeze({ internalCode: '104112', name: 'RADITE', aliases: Object.freeze(['RADITE']) }),
  Object.freeze({ internalCode: '104105', name: 'SALSINHA', aliases: Object.freeze(['SALSA', 'SALSINHA']) }),
]);

export function normalizeFernandoKleinTaxId(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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

const FERNANDO_KLEIN_ALIAS_INDEX = buildAliasIndex(FERNANDO_KLEIN_CATALOG);

export function isFernandoKleinEmitter(emitterTaxId: unknown): boolean {
  return normalizeFernandoKleinTaxId(emitterTaxId) === FERNANDO_KLEIN_TAX_ID;
}

export function resolveFernandoKleinProduct(input: FernandoKleinProductInput): ProductPresentation {
  const sourceCode = String(input.cProd ?? '');
  if (!isFernandoKleinEmitter(input.emitterTaxId)) {
    return Object.freeze({ sourceCode, internalCode: '' });
  }

  const productName = normalizeFernandoKleinProductName(input.xProd);
  return Object.freeze({
    sourceCode,
    internalCode: FERNANDO_KLEIN_ALIAS_INDEX[productName] ?? '',
  });
}

export function summarizeFernandoKleinProducts(input: Readonly<{
  emitterTaxId?: string | null;
  products?: readonly Readonly<{ cProd?: string | null; xProd?: string | null }>[] | null;
}>): FernandoKleinSummary {
  const products = Array.isArray(input.products) ? input.products : [];

  if (!isFernandoKleinEmitter(input.emitterTaxId)) {
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
      emitterTaxId: input.emitterTaxId,
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
