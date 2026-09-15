import { describe, expect, it } from 'vitest';
import {
  FISCAL_COORDINATION_MAX_ATTEMPTS,
  FISCAL_COORDINATION_WINDOW_MS,
  blockFiscalUsage,
  reserveFiscalUsage,
} from '../../../worker/fiscal-coordinator-core';

describe('fiscal coordination worker core', () => {
  const now = Date.UTC(2026, 8, 15, 17, 0, 0);

  it('reserves direct attempts atomically up to the shared hourly ceiling', () => {
    let state: unknown = undefined;

    for (let index = 0; index < FISCAL_COORDINATION_MAX_ATTEMPTS; index += 1) {
      const transition = reserveFiscalUsage(state, now + index * 1000);
      expect(transition.decision.allowDirectLookup).toBe(true);
      state = transition.state;
    }

    const denied = reserveFiscalUsage(state, now + FISCAL_COORDINATION_MAX_ATTEMPTS * 1000);
    expect(denied.decision).toMatchObject({
      allowDirectLookup: false,
      reason: 'shared_limit',
    });
    expect(denied.decision.blockedUntilUtc).toBe(now + FISCAL_COORDINATION_WINDOW_MS);
  });

  it('prunes attempts after the rolling one-hour window', () => {
    const initial = reserveFiscalUsage(undefined, now);
    const afterWindow = reserveFiscalUsage(initial.state, now + FISCAL_COORDINATION_WINDOW_MS + 1);

    expect(afterWindow.decision.allowDirectLookup).toBe(true);
    expect(afterWindow.state.attemptsUtc).toEqual([now + FISCAL_COORDINATION_WINDOW_MS + 1]);
  });

  it('propagates a SEFAZ cooldown for one hour', () => {
    const reserved = reserveFiscalUsage(undefined, now);
    const blocked = blockFiscalUsage(reserved.state, now + 5000);
    const denied = reserveFiscalUsage(blocked.state, now + 6000);

    expect(denied.decision).toEqual({
      allowDirectLookup: false,
      blockedUntilUtc: now + 5000 + FISCAL_COORDINATION_WINDOW_MS,
      reason: 'shared_cooldown',
    });
  });

  it('ignores malformed persisted values instead of corrupting the counter', () => {
    const transition = reserveFiscalUsage({
      attemptsUtc: ['bad', Number.NaN, now - FISCAL_COORDINATION_WINDOW_MS - 1, now - 1000],
      blockedUntilUtc: 'bad',
    }, now);

    expect(transition.state.attemptsUtc).toEqual([now - 1000, now]);
    expect(transition.decision.allowDirectLookup).toBe(true);
  });
});
