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

  it('flags batches above the conservative maximum', () => {
    const summary = parseBatchInput(KEY_A, 0);

    expect(MAX_BATCH_ITEMS).toBe(10);
    expect(summary.exceedsLimit).toBe(true);
  });
});
