declare const chrome: any;

const FISCAL_USAGE_KEY = 'fiscalUsageV1';
export const MAX_DIRECT_ATTEMPTS_PER_HOUR = 20;
export const FISCAL_WINDOW_MS = 60 * 60 * 1000;

type UsageEntry = {
  attempts: number[];
  blockedUntil: number | null;
};

type UsageState = {
  version: 1;
  globalBlockedUntil: number | null;
  identities: Record<string, UsageEntry>;
};

export type FiscalUsageDecision = Readonly<{
  allowDirectLookup: boolean;
  blockedUntil: number | null;
  reason: 'allowed' | 'cooldown' | 'local_limit' | 'state_recovery';
}>;

export async function reserveFiscalAttempt(
  cnpj: string,
  now = Date.now(),
): Promise<FiscalUsageDecision> {
  const state = await loadState(now);
  pruneState(state, now);

  if (state.globalBlockedUntil && state.globalBlockedUntil > now) {
    await saveState(state);
    return {
      allowDirectLookup: false,
      blockedUntil: state.globalBlockedUntil,
      reason: 'state_recovery',
    };
  }

  const entry = state.identities[cnpj] ?? { attempts: [], blockedUntil: null };
  state.identities[cnpj] = entry;
  pruneEntry(entry, now);

  if (entry.blockedUntil && entry.blockedUntil > now) {
    await saveState(state);
    return {
      allowDirectLookup: false,
      blockedUntil: entry.blockedUntil,
      reason: 'cooldown',
    };
  }

  if (entry.attempts.length >= MAX_DIRECT_ATTEMPTS_PER_HOUR) {
    const oldest = Math.min(...entry.attempts);
    entry.blockedUntil = oldest + FISCAL_WINDOW_MS;
    await saveState(state);
    return {
      allowDirectLookup: false,
      blockedUntil: entry.blockedUntil,
      reason: 'local_limit',
    };
  }

  entry.attempts.push(now);
  await saveState(state);
  return {
    allowDirectLookup: true,
    blockedUntil: null,
    reason: 'allowed',
  };
}

export async function blockFiscalUsage(cnpj: string, now = Date.now()): Promise<number> {
  const state = await loadState(now);
  pruneState(state, now);
  const entry = state.identities[cnpj] ?? { attempts: [], blockedUntil: null };
  state.identities[cnpj] = entry;
  entry.blockedUntil = now + FISCAL_WINDOW_MS;
  await saveState(state);
  return entry.blockedUntil;
}

async function loadState(now: number): Promise<UsageState> {
  try {
    const stored = await chrome.storage.local.get(FISCAL_USAGE_KEY);
    const raw = stored?.[FISCAL_USAGE_KEY];
    if (raw === undefined) return emptyState();
    if (!isUsageState(raw)) throw new Error('Estado fiscal inválido.');
    return structuredClone(raw);
  } catch {
    const recovered: UsageState = {
      ...emptyState(),
      globalBlockedUntil: now + FISCAL_WINDOW_MS,
    };
    try {
      await saveState(recovered);
    } catch {
      // Mantém o bloqueio no processo atual mesmo se o storage estiver indisponível.
    }
    return recovered;
  }
}

async function saveState(state: UsageState): Promise<void> {
  await chrome.storage.local.set({ [FISCAL_USAGE_KEY]: state });
}

function emptyState(): UsageState {
  return {
    version: 1,
    globalBlockedUntil: null,
    identities: {},
  };
}

function pruneState(state: UsageState, now: number): void {
  if (state.globalBlockedUntil !== null && state.globalBlockedUntil <= now) {
    state.globalBlockedUntil = null;
  }
  for (const entry of Object.values(state.identities)) pruneEntry(entry, now);
}

function pruneEntry(entry: UsageEntry, now: number): void {
  const cutoff = now - FISCAL_WINDOW_MS;
  entry.attempts = entry.attempts.filter(
    (timestamp) => Number.isFinite(timestamp) && timestamp > cutoff && timestamp <= now,
  );
  if (entry.blockedUntil !== null && entry.blockedUntil <= now) {
    entry.blockedUntil = null;
  }
}

function isUsageState(value: unknown): value is UsageState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (
    input.version !== 1 ||
    (input.globalBlockedUntil !== null && typeof input.globalBlockedUntil !== 'number')
  ) {
    return false;
  }
  if (!input.identities || typeof input.identities !== 'object' || Array.isArray(input.identities)) {
    return false;
  }

  return Object.values(input.identities as Record<string, unknown>).every((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const entry = raw as Record<string, unknown>;
    return (
      Array.isArray(entry.attempts) &&
      entry.attempts.every((item) => typeof item === 'number' && Number.isFinite(item)) &&
      (entry.blockedUntil === null ||
        (typeof entry.blockedUntil === 'number' && Number.isFinite(entry.blockedUntil)))
    );
  });
}
