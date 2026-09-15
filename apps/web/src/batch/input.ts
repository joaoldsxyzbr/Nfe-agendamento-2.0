import { validateAccessKey } from '../nfe/access-key';

// Compatibilidade com a UI atual: não existe mais teto rígido de itens por lote.
export const MAX_BATCH_ITEMS = Number.POSITIVE_INFINITY;

export type BatchInputSummary = {
  validKeys: string[];
  invalidCount: number;
  duplicateCount: number;
  totalCandidates: number;
  exceedsLimit: boolean;
};

const ACCESS_KEY_IN_TEXT = /(?<![A-Z0-9])[0-9]{6}[A-Z0-9]{12}[0-9]{26}(?![A-Z0-9])/gi;

export function parseBatchInput(raw: string, maxItems = MAX_BATCH_ITEMS): BatchInputSummary {
  const candidates = extractCandidates(raw);
  const validKeys: string[] = [];
  const seen = new Set<string>();
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

function extractCandidates(raw: string): string[] {
  const segments = raw
    .split(/[\r\n,;]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const candidates: string[] = [];

  for (const segment of segments) {
    const exactMatches = segment.match(ACCESS_KEY_IN_TEXT) ?? [];
    if (exactMatches.length > 0) {
      candidates.push(...exactMatches.map((match) => match.toUpperCase()));
      continue;
    }

    const compact = segment.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!compact) continue;

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
