import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, unknown>();

(globalThis as typeof globalThis & { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storage.get(key) })),
      set: vi.fn(async (value: Record<string, unknown>) => {
        for (const [key, item] of Object.entries(value)) {
          storage.set(key, structuredClone(item));
        }
      }),
    },
  },
};

describe('fiscal usage guard', () => {
  beforeEach(() => storage.clear());

  it('allows 20 direct attempts per hour and blocks the next one', async () => {
    const { reserveFiscalAttempt, FISCAL_WINDOW_MS } = await import('../src/fiscal-usage');
    const now = 1_700_000_000_000;

    for (let index = 0; index < 20; index += 1) {
      await expect(reserveFiscalAttempt('12345678000195', now + index)).resolves.toMatchObject({
        allowDirectLookup: true,
      });
    }

    const blocked = await reserveFiscalAttempt('12345678000195', now + 20);
    expect(blocked.allowDirectLookup).toBe(false);
    expect(blocked.reason).toBe('local_limit');
    expect(blocked.blockedUntil).toBe(now + FISCAL_WINDOW_MS);
  });
});
