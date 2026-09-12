const SOUZA_CRUZ_TAX_ID = '33009911028572';
const SOUZA_CRUZ_UNITS_PER_FISCAL_UNIT = 50;
const INTEGER_TOLERANCE = 1e-6;

export type SupplierQuantityInput = Readonly<{
  emitterTaxId?: string | null;
  quantity?: number | null;
}>;

export function normalizeSupplierTaxId(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function isSouzaCruzEmitter(emitterTaxId: unknown): boolean {
  return normalizeSupplierTaxId(emitterTaxId) === SOUZA_CRUZ_TAX_ID;
}

export function resolveSupplierInternalQuantity(input: SupplierQuantityInput): number | null {
  if (!isSouzaCruzEmitter(input.emitterTaxId)) return null;

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const converted = quantity * SOUZA_CRUZ_UNITS_PER_FISCAL_UNIT;
  const rounded = Math.round(converted);
  if (rounded <= 0 || Math.abs(converted - rounded) > INTEGER_TOLERANCE) return null;

  return rounded;
}
