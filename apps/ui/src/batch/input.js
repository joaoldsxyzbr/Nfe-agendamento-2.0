import { validateAccessKey } from '../nfe/access-key.js';
// Limite operacional para impedir crescimento ilimitado de memória no navegador.
export const MAX_BATCH_ITEMS = 100;
const ACCESS_KEY_IN_TEXT = /(?<![A-Z0-9])[0-9]{6}[A-Z0-9]{12}[0-9]{26}(?![A-Z0-9])/gi;
export function parseBatchInput(raw, maxItems = MAX_BATCH_ITEMS) {
    const candidates = extractCandidates(raw);
    const validKeys = [];
    const seen = new Set();
    let invalidCount = 0;
    let duplicateCount = 0;
    for (const candidate of candidates) {
        const validation = validateAccessKey(candidate);
        if (!validation.valid) {
            invalidCount += 1;
            continue;
        }
        if (seen.has(validation.value)) {
            duplicateCount += 1;
            continue;
        }
        seen.add(validation.value);
        validKeys.push(validation.value);
    }
    return {
        validKeys,
        invalidCount,
        duplicateCount,
        totalCandidates: candidates.length,
        exceedsLimit: validKeys.length > maxItems,
    };
}
function extractCandidates(raw) {
    const segments = raw
        .split(/[\r\n,;]+/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    const candidates = [];
    for (const segment of segments) {
        const exactMatches = segment.match(ACCESS_KEY_IN_TEXT) ?? [];
        if (exactMatches.length > 0) {
            candidates.push(...exactMatches.map((match) => match.toUpperCase()));
            continue;
        }
        const compact = segment.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (!compact)
            continue;
        if (compact.length > 44 && compact.length % 44 === 0) {
            for (let offset = 0; offset < compact.length; offset += 44) {
                candidates.push(compact.slice(offset, offset + 44));
            }
            continue;
        }
        candidates.push(compact);
    }
    return candidates;
}
