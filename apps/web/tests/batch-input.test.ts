import { describe, expect, it } from 'vitest';
import { MAX_BATCH_ITEMS, parseBatchInput } from '../src/batch/input';

const KEY_A = '42260812345678000123550010000012341000012342';
const KEY_B = '35260812345678000195550010000000011000000018';
const ALPHANUMERIC_KEY = '41260612ABC34501DE35550010000001231876543214';

describe('batch input', () => {
  it('preserves valid order and removes duplicates', () => {
    const summary = parseBatchInput(`${KEY_A}\n${KEY_B}\n${KEY_A}`);

    expect(summary.validKeys).toEqual([KEY_A, KEY_B]);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.invalidCount).toBe(0);
  });

  it('accepts formatted numeric and alphanumeric keys', () => {
    const formattedNumeric = KEY_A.replace(/(.{4})/g, '$1 ').trim();
    const formattedAlpha = ALPHANUMERIC_KEY.toLowerCase().replace(/(.{4})/g, '$1 ').trim();
    const summary = parseBatchInput(`${formattedNumeric}; ${formattedAlpha}; 12345`);

    expect(summary.validKeys).toEqual([KEY_A, ALPHANUMERIC_KEY]);
    expect(summary.invalidCount).toBe(1);
  });

  it('extracts an alphanumeric key surrounded by ordinary text', () => {
    const summary = parseBatchInput(`NF-e: ${ALPHANUMERIC_KEY}`);

    expect(summary.validKeys).toEqual([ALPHANUMERIC_KEY]);
    expect(summary.invalidCount).toBe(0);
  });

  it('caps a batch at 100 valid unique NF-e keys', () => {
    const accepted = Array.from({ length: 100 }, (_, index) => createValidKey(index + 1));
    const acceptedSummary = parseBatchInput(accepted.join('\n'));

    expect(MAX_BATCH_ITEMS).toBe(100);
    expect(acceptedSummary.validKeys).toEqual(accepted);
    expect(acceptedSummary.exceedsLimit).toBe(false);

    const rejected = [...accepted, createValidKey(101)];
    const rejectedSummary = parseBatchInput(rejected.join('\n'));

    expect(rejectedSummary.validKeys).toEqual(rejected);
    expect(rejectedSummary.exceedsLimit).toBe(true);
    expect(rejectedSummary.invalidCount).toBe(0);
  });
});

function createValidKey(sequence: number): string {
  const prefix = `${KEY_A.slice(0, 35)}${String(sequence).padStart(8, '0')}`;
  let sum = 0;
  let weight = 2;

  for (let index = 42; index >= 0; index -= 1) {
    sum += (prefix.charCodeAt(index) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const candidate = 11 - (sum % 11);
  const checkDigit = candidate >= 10 ? 0 : candidate;
  return `${prefix}${checkDigit}`;
}
