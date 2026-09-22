import { isOfficialDownloadUrl } from './portal-dom';

const MAX_CAPTURED_BODY_BYTES = 1024 * 1024;

export type PageReplayRequest = Readonly<{
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body: null | Readonly<{
    encoding: 'text' | 'base64';
    value: string;
  }>;
}>;

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


export function buildPageReplayRequest(details: CapturedRequest): PageReplayRequest {
  const replay = buildReplayRequest(details);
  const method = String(replay.init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'POST') {
    throw new Error('Método não permitido.');
  }

  const headers: Record<string, string> = {};
  new Headers(replay.init.headers).forEach((value, key) => {
    headers[key] = value;
  });

  const body = replay.init.body;
  if (body === undefined || body === null) {
    return { url: replay.url, method, headers, body: null };
  }

  if (body instanceof URLSearchParams) {
    return {
      url: replay.url,
      method,
      headers,
      body: { encoding: 'text', value: body.toString() },
    };
  }

  if (typeof body === 'string') {
    return {
      url: replay.url,
      method,
      headers,
      body: { encoding: 'text', value: body },
    };
  }

  if (body instanceof Uint8Array) {
    return {
      url: replay.url,
      method,
      headers,
      body: { encoding: 'base64', value: bytesToBase64(body) },
    };
  }

  if (body instanceof ArrayBuffer) {
    return {
      url: replay.url,
      method,
      headers,
      body: { encoding: 'base64', value: bytesToBase64(new Uint8Array(body)) },
    };
  }

  throw new Error('Corpo da requisição não pode ser serializado com segurança.');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}
