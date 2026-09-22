import { isOfficialDownloadUrl } from './portal-dom';

const MAX_CAPTURED_BODY_BYTES = 1024 * 1024;

export type CapturedRequest = {
  url: string;
  method: string;
  initiator?: string;
  requestBody?: {
    formData?: Record<string, string[]>;
    raw?: Array<{ bytes?: ArrayBuffer }>;
  };
};

export function shouldCapturePortalRequest(details: CapturedRequest): boolean {
  if (!isOfficialDownloadUrl(details.url)) return false;
  if (!['GET', 'POST'].includes(details.method.toUpperCase())) return false;
  if (details.initiator?.startsWith('chrome-extension://')) return false;
  return true;
}

export function buildReplayRequest(details: CapturedRequest): { url: string; init: RequestInit } {
  if (!isOfficialDownloadUrl(details.url)) {
    throw new Error('URL de download não permitida.');
  }

  const method = details.method.toUpperCase();
  if (method === 'GET') {
    return {
      url: details.url,
      init: { method: 'GET', credentials: 'include', redirect: 'follow' },
    };
  }

  if (method !== 'POST') {
    throw new Error('Método não permitido.');
  }

  const formData = details.requestBody?.formData;
  if (formData) {
    const body = new URLSearchParams();
    for (const [key, values] of Object.entries(formData)) {
      for (const value of values) body.append(key, value);
    }
    if (new TextEncoder().encode(body.toString()).byteLength > MAX_CAPTURED_BODY_BYTES) {
      throw new Error('Corpo da requisição excede o limite.');
    }
    return {
      url: details.url,
      init: {
        method: 'POST',
        credentials: 'include',
        redirect: 'follow',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      },
    };
  }

  const raw = details.requestBody?.raw ?? [];
  const chunks = raw
    .map((item) => item.bytes)
    .filter((value): value is ArrayBuffer => value instanceof ArrayBuffer)
    .map((value) => new Uint8Array(value));
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  if (total === 0 || total > MAX_CAPTURED_BODY_BYTES) {
    throw new Error('Corpo POST não suportado.');
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    url: details.url,
    init: {
      method: 'POST',
      credentials: 'include',
      redirect: 'follow',
      body,
    },
  };
}
