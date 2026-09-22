declare const chrome: any;

const FISCAL_IDENTITY_KEY = 'fiscalIdentityV1';
const FISCAL_USAGE_KEY = 'fiscalUsageV1';

export const MAX_DIRECT_ATTEMPTS_PER_HOUR = 20;
export const CONSUMPTION_WINDOW_MS = 60 * 60 * 1000;

export type FiscalIdentity = Readonly<{ cnpj: string }>;
export type FiscalUsageDecision = Readonly<{
  allowDirectLookup: boolean;
  blockedUntilUtc: number | null;
  reason: 'cooldown' | 'local_limit' | null;
}>;

type FiscalUsageEntry = { attemptsUtc: number[]; blockedUntilUtc: number | null };
type FiscalUsageState = { version: 1; entries: Record<string, FiscalUsageEntry> };

let usageMutationQueue: Promise<void> = Promise.resolve();

export function normalizeFiscalCnpj(value: string): string | null {
  const candidate = String(value ?? '').trim().toUpperCase().replace(/[.\/\-\s]/g, '');
  if (candidate.length !== 14) return null;
  for (let index = 0; index < 12; index += 1) {
    if (!/[A-Z0-9]/.test(candidate[index] ?? '')) return null;
  }
  if (!/^[0-9]{2}$/.test(candidate.slice(12))) return null;

  const firstDigit = calculateDigit(candidate.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (Number(candidate[12]) !== firstDigit) return null;
  const secondDigit = calculateDigit(candidate.slice(0, 12) + String(firstDigit), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (Number(candidate[13]) !== secondDigit) return null;
  return candidate;
}

export async function loadFiscalIdentity(): Promise<FiscalIdentity | null> {
  try {
    const stored = await chrome.storage.local.get(FISCAL_IDENTITY_KEY);
    const value = stored?.[FISCAL_IDENTITY_KEY];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const cnpj = normalizeFiscalCnpj(String((value as Record<string, unknown>).cnpj ?? ''));
    return cnpj ? { cnpj } : null;
  } catch {
    return null;
  }
}

export async function saveFiscalIdentity(value: string): Promise<FiscalIdentity> {
  const cnpj = normalizeFiscalCnpj(value);
  if (!cnpj) throw new Error('CNPJ da empresa vinculada ao A1 inválido.');
  const identity = { cnpj } as const;
  await chrome.storage.local.set({ [FISCAL_IDENTITY_KEY]: identity });
  return identity;
}

export async function clearFiscalIdentity(): Promise<void> {
  await chrome.storage.local.remove(FISCAL_IDENTITY_KEY);
}

export async function checkFiscalUsage(cnpj: string, now = Date.now()): Promise<FiscalUsageDecision> {
  return withUsageMutation(async () => {
    const state = await loadUsageState();
    const entry = state.entries[cnpj] ?? { attemptsUtc: [], blockedUntilUtc: null };
    state.entries[cnpj] = entry;
    const changed = pruneEntry(entry, now);

    if (entry.blockedUntilUtc !== null && entry.blockedUntilUtc > now) {
      if (changed) await saveUsageState(state);
      return { allowDirectLookup: false, blockedUntilUtc: entry.blockedUntilUtc, reason: 'cooldown' };
    }

    if (entry.attemptsUtc.length >= MAX_DIRECT_ATTEMPTS_PER_HOUR) {
      const oldest = Math.min(...entry.attemptsUtc);
      entry.blockedUntilUtc = oldest + CONSUMPTION_WINDOW_MS;
      await saveUsageState(state);
      return { allowDirectLookup: false, blockedUntilUtc: entry.blockedUntilUtc, reason: 'local_limit' };
    }

    if (changed) await saveUsageState(state);
    return { allowDirectLookup: true, blockedUntilUtc: null, reason: null };
  });
}

export async function recordFiscalAttempt(cnpj: string, now = Date.now()): Promise<void> {
  await withUsageMutation(async () => {
    const state = await loadUsageState();
    const entry = state.entries[cnpj] ?? { attemptsUtc: [], blockedUntilUtc: null };
    state.entries[cnpj] = entry;
    pruneEntry(entry, now);
    entry.attemptsUtc.push(now);
    await saveUsageState(state);
  });
}

export async function blockFiscalUsage(cnpj: string, now = Date.now(), durationMs = CONSUMPTION_WINDOW_MS): Promise<number> {
  return withUsageMutation(async () => {
    const state = await loadUsageState();
    const entry = state.entries[cnpj] ?? { attemptsUtc: [], blockedUntilUtc: null };
    state.entries[cnpj] = entry;
    pruneEntry(entry, now);
    entry.blockedUntilUtc = now + durationMs;
    await saveUsageState(state);
    return entry.blockedUntilUtc;
  });
}

function calculateDigit(value: string, weights: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? '';
    sum += (character.charCodeAt(0) - '0'.charCodeAt(0)) * (weights[index] ?? 0);
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function pruneEntry(entry: FiscalUsageEntry, now: number): boolean {
  const cutoff = now - CONSUMPTION_WINDOW_MS;
  const before = entry.attemptsUtc.length;
  entry.attemptsUtc = entry.attemptsUtc.filter((timestamp) => timestamp > cutoff);
  let changed = entry.attemptsUtc.length !== before;
  if (entry.blockedUntilUtc !== null && entry.blockedUntilUtc <= now) {
    entry.blockedUntilUtc = null;
    changed = true;
  }
  return changed;
}

async function loadUsageState(): Promise<FiscalUsageState> {
  const stored = await chrome.storage.local.get(FISCAL_USAGE_KEY);
  const value = stored?.[FISCAL_USAGE_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { version: 1, entries: {} };

  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !input.entries || typeof input.entries !== 'object' || Array.isArray(input.entries)) {
    throw new Error('Estado de proteção fiscal local inválido.');
  }

  const entries: Record<string, FiscalUsageEntry> = {};
  for (const [key, raw] of Object.entries(input.entries as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Estado de proteção fiscal local inválido.');
    const item = raw as Record<string, unknown>;
    if (!Array.isArray(item.attemptsUtc) || !item.attemptsUtc.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error('Estado de proteção fiscal local inválido.');
    }
    const blocked = item.blockedUntilUtc;
    if (blocked !== null && blocked !== undefined && (typeof blocked !== 'number' || !Number.isFinite(blocked))) {
      throw new Error('Estado de proteção fiscal local inválido.');
    }
    entries[key] = {
      attemptsUtc: [...item.attemptsUtc] as number[],
      blockedUntilUtc: typeof blocked === 'number' ? blocked : null,
    };
  }
  return { version: 1, entries };
}

async function saveUsageState(state: FiscalUsageState): Promise<void> {
  await chrome.storage.local.set({ [FISCAL_USAGE_KEY]: state });
}

async function withUsageMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const previous = usageMutationQueue;
  let release!: () => void;
  usageMutationQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await mutation(); }
  finally { release(); }
}
