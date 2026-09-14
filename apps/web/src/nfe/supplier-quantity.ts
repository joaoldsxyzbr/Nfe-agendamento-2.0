import { normalizeSupplierTaxId, resolveSupplierRule } from './supplier-rules';

const INTEGER_TOLERANCE = 1e-6;

export type SupplierQuantityInput = Readonly<{
  emitterTaxId?: string | null;
  quantity?: number | null;
}>;

export { normalizeSupplierTaxId };

export function isSouzaCruzEmitter(emitterTaxId: unknown): boolean {
  return resolveSupplierRule(emitterTaxId)?.id === 'souza-cruz';
}

export function resolveSupplierInternalQuantity(input: SupplierQuantityInput): number | null {
  const quantityRule = resolveSupplierRule(input.emitterTaxId)?.internalQuantity;
  if (!quantityRule) return null;

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const converted = quantity * quantityRule.multiplier;
  const rounded = Math.round(converted);
  if (rounded <= 0 || Math.abs(converted - rounded) > INTEGER_TOLERANCE) return null;

  return rounded;
}
