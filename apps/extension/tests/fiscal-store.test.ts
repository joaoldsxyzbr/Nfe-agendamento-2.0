import { beforeEach, describe, expect, it } from 'vitest';

const VALID_CNPJ = '12345678000195';

function installStorage() {
  const stored = new Map<string, unknown>();
  (globalThis as typeof globalThis & { chrome: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: stored.get(key) }),
        set: async (value: Record<string, unknown>) => {
          for (const [key, item] of Object.entries(value)) stored.set(key, item);
        },
        remove: async (key: string) => stored.delete(key),
      },
    },
  };
}

describe('fiscal identity and local usage guard', () => {
  beforeEach(() => { installStorage(); });

  it('normalizes and persists the CNPJ used by the A1 certificate', async () => {
    const { loadFiscalIdentity, normalizeFiscalCnpj, saveFiscalIdentity } = await import('../src/fiscal-store');
    expect(normalizeFiscalCnpj('12.345.678/0001-95')).toBe(VALID_CNPJ);
    expect(normalizeFiscalCnpj('12.345.678/0001-96')).toBeNull();
    await saveFiscalIdentity('12.345.678/0001-95');
    await expect(loadFiscalIdentity()).resolves.toEqual({ cnpj: VALID_CNPJ });
  });

  it('allows 20 direct attempts per hour and blocks the next one', async () => {
    const { checkFiscalUsage, recordFiscalAttempt } = await import('../src/fiscal-store');
    const start = 1_800_000_000_000;
    for (let index = 0; index < 20; index += 1) {
      expect((await checkFiscalUsage(VALID_CNPJ, start + index)).allowDirectLookup).toBe(true);
      await recordFiscalAttempt(VALID_CNPJ, start + index);
    }
    const decision = await checkFiscalUsage(VALID_CNPJ, start + 30);
    expect(decision.allowDirectLookup).toBe(false);
    expect(decision.reason).toBe('local_limit');
  });

  it('keeps a 656-style cooldown for one hour', async () => {
    const { blockFiscalUsage, checkFiscalUsage } = await import('../src/fiscal-store');
    const start = 1_800_000_000_000;
    const blockedUntil = await blockFiscalUsage(VALID_CNPJ, start);
    expect((await checkFiscalUsage(VALID_CNPJ, start + 1)).allowDirectLookup).toBe(false);
    expect((await checkFiscalUsage(VALID_CNPJ, blockedUntil + 1)).allowDirectLookup).toBe(true);
  });
});
