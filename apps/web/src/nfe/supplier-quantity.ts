import {
  normalizeSupplierName,
  resolveSupplierRuleForPresentation,
} from './supplier-rules';

const INTEGER_TOLERANCE = 1e-6;

export type SupplierQuantityInput = Readonly<{
  supplierRuleId?: string | null;
  emitterName?: string | null;
  quantity?: number | null;
}>;

export { normalizeSupplierName };

export function isSouzaCruzEmitter(emitterName: unknown): boolean {
  return resolveSupplierRuleForPresentation({ emitterName })?.id === 'souza-cruz';
}

export function resolveSupplierInternalQuantity(input: SupplierQuantityInput): number | null {
  const quantityRule = resolveSupplierRuleForPresentation({
    supplierRuleId: input.supplierRuleId,
    emitterName: input.emitterName,
  })?.internalQuantity;
  if (!quantityRule) return null;

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const converted = quantity * quantityRule.multiplier;
  const rounded = Math.round(converted);
  if (rounded <= 0 || Math.abs(converted - rounded) > INTEGER_TOLERANCE) return null;

  return rounded;
}
