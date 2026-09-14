import { describe, expect, it } from 'vitest';
import { MAX_BATCH_ITEMS, parseBatchInput } from '../src/batch/input';

const KEY_A = '42260812345678000123550010000012341000012342';
const KEY_B = '35260812345678000195550010000000011000000018';

describe('batch input', () => {
  it('preserves valid order and removes duplicates', () => {
    const summary = parseBatchInput(`${KEY_A}\n${KEY_B}\n${KEY_A}`);

    expect(summary.validKeys).toEqual([KEY_A, KEY_B]);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.invalidCount).toBe(0);
  });

  it('accepts formatted keys and reports invalid candidates', () => {
    const formatted = KEY_A.replace(/(\d{4})/g, '$1 ').trim();
    const summary = parseBatchInput(`${formatted}; 12345`);

    expect(summary.validKeys).toEqual([KEY_A]);
    expect(summary.invalidCount).toBe(1);
  });

  it('accepts more than ten valid keys without a rigid batch cap', () => {
    const keys = Array.from({ length: 25 }, (_, index) => createValidKey(index + 1));
    const summary = parseBatchInput(keys.join('\n'));

    expect(MAX_BATCH_ITEMS).toBe(Number.POSITIVE_INFINITY);
    expect(summary.validKeys).toEqual(keys);
    expect(summary.exceedsLimit).toBe(false);
    expect(summary.invalidCount).toBe(0);
  });
});

function createValidKey(sequence: number): string {
  const prefix = `${KEY_A.slice(0, 35)}${String(sequence).padStart(8, '0')}`;
  let sum = 0;
  let weight = 2;

  for (let index = 42; index >= 0; index -= 1) {
    sum += Number(prefix[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  let checkDigit = 11 - (sum % 11);
  if (checkDigit >= 10) checkDigit = 0;
  return `${prefix}${checkDigit}`;
}
