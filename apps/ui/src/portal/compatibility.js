/** Known-good XML capture baseline. Later releases require independent validation. */
export const MIN_PORTAL_EXTENSION_VERSION = '0.2.16';
export const VERIFIED_EXTENSION_ONLY_VERSION = '0.3.0';
export function hasRequiredExtensionCapabilities(value) {
    return value.openOptions && value.portalLookup && value.supplierResolution;
}
/** Informational only. Never use this result to block an otherwise connected extension. */
export function assessExtensionCompatibility(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
    if (!match)
        return 'unknown';
    if (version === VERIFIED_EXTENSION_ONLY_VERSION) return 'compatible';
    const actual = match.slice(1).map(Number);
    if (actual.some((part) => !Number.isSafeInteger(part)))
        return 'unknown';
    const minimum = MIN_PORTAL_EXTENSION_VERSION.split('.').map(Number);
    for (let index = 0; index < minimum.length; index += 1) {
        if (actual[index] < minimum[index])
            return 'outdated';
        if (actual[index] > minimum[index])
            return 'unknown';
    }
    return 'compatible';
}
