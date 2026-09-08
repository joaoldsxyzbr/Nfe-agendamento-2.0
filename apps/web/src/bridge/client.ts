import {
  BRIDGE_BASE_URL,
  type BridgeHealth,
  type CertificateCatalog,
  type CertificateSummary,
  type NfeLookupCategory,
  type NfeLookupResult,
} from './contracts';

const DEFAULT_TIMEOUT_MS = 2_000;
const CERTIFICATE_KEYS = ['issuer', 'notAfter', 'notBefore', 'subject', 'thumbprint'] as const;
const LOOKUP_KEYS = ['cStat', 'category', 'message', 'xml'] as const;
const LOOKUP_CATEGORIES = new Set<NfeLookupCategory>([
  'success',
  'fiscal_status',
  'consumption_limit',
  'certificate_error',
  'transport_unavailable',
  'technical_error',
]);

export class BridgeClient {
  constructor(
    private readonly baseUrl = BRIDGE_BASE_URL,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async health(signal?: AbortSignal): Promise<BridgeHealth> {
    const response = await this.request('/health', { method: 'GET' }, signal);
    const payload: unknown = await response.json();
    if (!isBridgeHealth(payload)) {
      throw new Error('Resposta inválida do Bridge');
    }

    return payload;
  }

  async listCertificates(signal?: AbortSignal): Promise<CertificateCatalog> {
    const response = await this.request('/certificates', { method: 'GET' }, signal);
    const payload: unknown = await response.json();
    if (!isCertificateCatalog(payload)) {
      throw new Error('Resposta inválida de certificados');
    }

    return payload;
  }

  async selectCertificate(thumbprint: string, signal?: AbortSignal): Promise<void> {
    const normalized = thumbprint.trim();
    if (!normalized) {
      throw new Error('Thumbprint do certificado não informado');
    }

    await this.request(
      '/certificate/select',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ thumbprint: normalized }),
      },
      signal,
    );
  }

  async lookupNfe(accessKey: string, signal?: AbortSignal): Promise<NfeLookupResult> {
    const normalized = accessKey.trim();
    if (!normalized) {
      throw new Error('Chave NF-e não informada');
    }

    const response = await this.request(
      '/nfe/lookup',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessKey: normalized }),
      },
      signal,
    );
    const payload: unknown = await response.json();
    if (!isNfeLookupResult(payload)) {
      throw new Error('Resposta inválida da consulta NF-e');
    }

    return payload;
  }

  private async request(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    const timeoutController = new AbortController();
    const timeout = globalThis.setTimeout(() => timeoutController.abort(), this.timeoutMs);
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...init.headers,
        },
        signal: requestSignal,
      });

      if (!response.ok) {
        throw new Error(`Bridge indisponível (${response.status})`);
      }

      return response;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

function isBridgeHealth(value: unknown): value is BridgeHealth {
  if (!value || typeof value !== 'object') return false;

  const health = value as Record<string, unknown>;
  return (
    typeof health.version === 'string' &&
    health.version.length > 0 &&
    health.status === 'ok' &&
    typeof health.webView2Available === 'boolean' &&
    typeof health.certificateSelected === 'boolean'
  );
}

function isCertificateCatalog(value: unknown): value is CertificateCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const catalog = value as Record<string, unknown>;
  if (!hasExactKeys(catalog, ['certificates', 'selectedThumbprint'])) return false;
  if (!Array.isArray(catalog.certificates)) return false;
  if (catalog.selectedThumbprint !== null && typeof catalog.selectedThumbprint !== 'string') return false;

  return catalog.certificates.every(isCertificateSummary);
}

function isCertificateSummary(value: unknown): value is CertificateSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const certificate = value as Record<string, unknown>;
  if (!hasExactKeys(certificate, CERTIFICATE_KEYS)) return false;

  return (
    typeof certificate.subject === 'string' &&
    typeof certificate.issuer === 'string' &&
    isIsoDateString(certificate.notBefore) &&
    isIsoDateString(certificate.notAfter) &&
    typeof certificate.thumbprint === 'string' &&
    certificate.thumbprint.length > 0
  );
}

function isNfeLookupResult(value: unknown): value is NfeLookupResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const result = value as Record<string, unknown>;
  if (!hasExactKeys(result, LOOKUP_KEYS)) return false;
  if (typeof result.category !== 'string' || !LOOKUP_CATEGORIES.has(result.category as NfeLookupCategory)) {
    return false;
  }
  if (result.cStat !== null && typeof result.cStat !== 'string') return false;
  if (result.message !== null && typeof result.message !== 'string') return false;

  if (result.category === 'success') {
    return typeof result.xml === 'string' && result.xml.length > 0;
  }

  return result.xml === null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  return actual.length === normalizedExpected.length &&
    actual.every((key, index) => key === normalizedExpected[index]);
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}
