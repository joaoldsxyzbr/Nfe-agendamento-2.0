import { describe, expect, it } from 'vitest';
import { assessExtensionCompatibility, hasRequiredExtensionCapabilities, MIN_PORTAL_EXTENSION_VERSION, } from '../src/portal/compatibility';
describe('advisory extension compatibility', () => {
    it('recognizes only the explicitly validated release, not speculative future compatibility', () => {
        expect(MIN_PORTAL_EXTENSION_VERSION).toBe('0.2.16');
        expect(assessExtensionCompatibility('0.2.16')).toBe('compatible');
        expect(assessExtensionCompatibility('0.2.17')).toBe('unknown');
        expect(assessExtensionCompatibility('0.3.0')).toBe('compatible');
    });
    it('recommends updating older extension versions without disconnecting them', () => {
        expect(assessExtensionCompatibility('0.2.15')).toBe('outdated');
        expect(assessExtensionCompatibility('0.1.99')).toBe('outdated');
        expect(hasRequiredExtensionCapabilities({
            openOptions: true, portalLookup: true, supplierResolution: true,
        })).toBe(true);
        expect(hasRequiredExtensionCapabilities({
            openOptions: false, portalLookup: true, supplierResolution: true,
        })).toBe(false);
    });
    it('does not guess version compatibility from malformed version strings', () => {
        expect(assessExtensionCompatibility('')).toBe('unknown');
        expect(assessExtensionCompatibility('0.2.16-beta')).toBe('unknown');
        expect(assessExtensionCompatibility('unknown')).toBe('unknown');
        expect(assessExtensionCompatibility('9007199254740992.0.0')).toBe('unknown');
    });
});
