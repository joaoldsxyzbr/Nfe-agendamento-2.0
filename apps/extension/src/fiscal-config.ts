declare const chrome: any;

const FISCAL_IDENTITY_KEY = 'fiscalIdentityV1';

export type FiscalIdentity = Readonly<{
  version: 1;
  cnpj: string;
}>;

export function normalizeFiscalCnpj(value: string): string | null {
  const digits = String(value ?? '').replace(/[.\-\/\s]/g, '');
  if (!/^[0-9]{14}$/.test(digits)) return null;
  if (/^([0-9])\1{13}$/.test(digits)) return null;

  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(
    digits.slice(0, 12) + String(first),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  if (digits.slice(-2) !== `${first}${second}`) return null;
  return digits;
}

export async function loadFiscalIdentity(): Promise<FiscalIdentity | null> {
  try {
    const stored = await chrome.storage.local.get(FISCAL_IDENTITY_KEY);
    const raw = stored?.[FISCAL_IDENTITY_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const input = raw as Record<string, unknown>;
    if (input.version !== 1 || typeof input.cnpj !== 'string') return null;
    const cnpj = normalizeFiscalCnpj(input.cnpj);
    return cnpj ? Object.freeze({ version: 1 as const, cnpj }) : null;
  } catch {
    return null;
  }
}

export async function saveFiscalIdentity(cnpj: string): Promise<FiscalIdentity> {
  const normalized = normalizeFiscalCnpj(cnpj);
  if (!normalized) throw new Error('CNPJ inválido.');
  const identity = Object.freeze({ version: 1 as const, cnpj: normalized });
  await chrome.storage.local.set({ [FISCAL_IDENTITY_KEY]: identity });
  return identity;
}

export async function clearFiscalIdentity(): Promise<void> {
  await chrome.storage.local.remove(FISCAL_IDENTITY_KEY);
}

function calculateDigit(value: string, weights: readonly number[]): number {
  const sum = [...value].reduce(
    (total, digit, index) => total + Number(digit) * (weights[index] ?? 0),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
