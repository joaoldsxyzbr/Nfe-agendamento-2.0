export const FISCAL_COORDINATION_WINDOW_MS = 60 * 60 * 1000;
export const FISCAL_COORDINATION_MAX_ATTEMPTS = 20;

export type FiscalCoordinationState = Readonly<{
  attemptsUtc: readonly number[];
  blockedUntilUtc: number | null;
}>;

export type FiscalCoordinationDecision = Readonly<{
  allowDirectLookup: boolean;
  blockedUntilUtc: number | null;
  reason: string | null;
}>;

export type FiscalCoordinationTransition = Readonly<{
  state: FiscalCoordinationState;
  decision: FiscalCoordinationDecision;
}>;

export function reserveFiscalUsage(
  rawState: unknown,
  nowUtc: number,
): FiscalCoordinationTransition {
  const state = normalizeFiscalCoordinationState(rawState, nowUtc);

  if (state.blockedUntilUtc !== null && state.blockedUntilUtc > nowUtc) {
    return {
      state,
      decision: {
        allowDirectLookup: false,
        blockedUntilUtc: state.blockedUntilUtc,
        reason: 'shared_cooldown',
      },
    };
  }

  if (state.attemptsUtc.length >= FISCAL_COORDINATION_MAX_ATTEMPTS) {
    const blockedUntilUtc = state.attemptsUtc[0]! + FISCAL_COORDINATION_WINDOW_MS;
    const blockedState = freezeState(state.attemptsUtc, blockedUntilUtc);
    return {
      state: blockedState,
      decision: {
        allowDirectLookup: false,
        blockedUntilUtc,
        reason: 'shared_limit',
      },
    };
  }

  const reservedState = freezeState([...state.attemptsUtc, nowUtc], null);
  return {
    state: reservedState,
    decision: {
      allowDirectLookup: true,
      blockedUntilUtc: null,
      reason: null,
    },
  };
}

export function blockFiscalUsage(rawState: unknown, nowUtc: number): FiscalCoordinationTransition {
  const state = normalizeFiscalCoordinationState(rawState, nowUtc);
  const requestedBlock = nowUtc + FISCAL_COORDINATION_WINDOW_MS;
  const blockedUntilUtc = Math.max(state.blockedUntilUtc ?? 0, requestedBlock);
  const blockedState = freezeState(state.attemptsUtc, blockedUntilUtc);

  return {
    state: blockedState,
    decision: {
      allowDirectLookup: false,
      blockedUntilUtc,
      reason: 'sefaz_cooldown',
    },
  };
}

export function normalizeFiscalCoordinationState(
  rawState: unknown,
  nowUtc: number,
): FiscalCoordinationState {
  const source = isRecord(rawState) ? rawState : {};
  const cutoff = nowUtc - FISCAL_COORDINATION_WINDOW_MS;
  const attempts = Array.isArray(source.attemptsUtc)
    ? source.attemptsUtc
      .filter((value): value is number => Number.isFinite(value))
      .filter((value) => value > cutoff && value <= nowUtc)
      .sort((left, right) => left - right)
    : [];
  const rawBlockedUntil = typeof source.blockedUntilUtc === 'number' && Number.isFinite(source.blockedUntilUtc)
    ? source.blockedUntilUtc
    : null;
  const blockedUntilUtc = rawBlockedUntil !== null && rawBlockedUntil > nowUtc
    ? rawBlockedUntil
    : null;

  return freezeState(attempts, blockedUntilUtc);
}

function freezeState(attemptsUtc: readonly number[], blockedUntilUtc: number | null): FiscalCoordinationState {
  return Object.freeze({
    attemptsUtc: Object.freeze([...attemptsUtc]),
    blockedUntilUtc,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
