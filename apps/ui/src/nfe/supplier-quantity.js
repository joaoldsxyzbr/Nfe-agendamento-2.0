import { normalizeSupplierName, resolveSupplierRuleForPresentation, } from './supplier-rules.js';
const INTEGER_TOLERANCE = 1e-6;
export { normalizeSupplierName };
export function isSouzaCruzEmitter(emitterName) {
    return resolveSupplierRuleForPresentation({ emitterName })?.id === 'souza-cruz';
}
export function resolveSupplierInternalQuantity(input) {
    const quantityRule = resolveSupplierRuleForPresentation({
        supplierRuleId: input.supplierRuleId,
        emitterName: input.emitterName,
    })?.internalQuantity;
    if (!quantityRule)
        return null;
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0)
        return null;
    const converted = quantity * quantityRule.multiplier;
    const rounded = Math.round(converted);
    if (rounded <= 0 || Math.abs(converted - rounded) > INTEGER_TOLERANCE)
        return null;
    return rounded;
}
