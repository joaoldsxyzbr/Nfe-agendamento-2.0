import { describe, expect, it } from 'vitest';
import {
  BATCH_DRAFT_DEBOUNCE_MS,
  MAX_BATCH_ITEMS,
  HANDSHAKE_TIMEOUT_MS,
  INFO_CACHE_TTL_MS,
  PORTAL_POPUP_WIDTH,
  PORTAL_POPUP_HEIGHT,
  RESULT_TIMEOUT_MS,
  DOWNLOAD_TIMEOUT_MS,
  MAX_XML_BYTES,
} from '../src/shared/constants.js';

describe('shared constants', () => {
  it('define valores razoáveis para debounce e cache', () => {
    expect(BATCH_DRAFT_DEBOUNCE_MS).toBeGreaterThan(0);
    expect(BATCH_DRAFT_DEBOUNCE_MS).toBeLessThanOrEqual(500);
    expect(INFO_CACHE_TTL_MS).toBeGreaterThan(0);
    expect(INFO_CACHE_TTL_MS).toBeLessThanOrEqual(10000);
  });

  it('define limite de lote operacional', () => {
    expect(MAX_BATCH_ITEMS).toBeGreaterThan(0);
    expect(MAX_BATCH_ITEMS).toBeLessThanOrEqual(1000);
  });

  it('define timeouts do Portal', () => {
    expect(HANDSHAKE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(RESULT_TIMEOUT_MS).toBeGreaterThan(DOWNLOAD_TIMEOUT_MS);
    expect(MAX_XML_BYTES).toBe(10 * 1024 * 1024);
  });

  it('define dimensões do popup do Portal', () => {
    expect(PORTAL_POPUP_WIDTH).toBeGreaterThanOrEqual(800);
    expect(PORTAL_POPUP_HEIGHT).toBeGreaterThanOrEqual(600);
  });
});
