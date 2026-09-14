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
    const exactMatches = segment.match(/(?<!\d)\d{44}(?!\d)/g) ?? [];
    if (exactMatches.length > 0) {
      candidates.push(...exactMatches);
      const remainingDigits = segment
        .replace(/(?<!\d)\d{44}(?!\d)/g, '')
        .replace(/\D/g, '');
      if (remainingDigits) candidates.push(remainingDigits);
      continue;
    }

    const digits = segment.replace(/\D/g, '');
    if (!digits) continue;

    if (digits.length > 44 && digits.length % 44 === 0) {
      for (let offset = 0; offset < digits.length; offset += 44) {
        candidates.push(digits.slice(offset, offset + 44));
      }
      continue;
    }

    candidates.push(digits);
  }

  return candidates;
}
