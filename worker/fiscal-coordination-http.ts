import type { FiscalCoordinationDecision } from './fiscal-coordinator-core';

export const COORDINATION_RATE_LIMIT_PERIOD_SECONDS = 60;

const COORDINATION_PREFIX = '/api/fiscal-coordination/';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type FiscalOperation = 'reserve' | 'block';

type FiscalCoordinationDependencies = Readonly<{
  rateLimit: (key: string) => Promise<unknown>;
  executeFiscal: (
    operation: FiscalOperation,
    namespace: string,
  ) => Promise<FiscalCoordinationDecision>;
}>;

export async function handleFiscalCoordinationRequest(
  request: Request,
  dependencies: FiscalCoordinationDependencies,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(COORDINATION_PREFIX)) {
    return null;
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
  }

  const token = bearerToken(request.headers.get('Authorization'));
  if (!token) {
    return json({ error: 'unauthorized' }, 401);
  }

  const operation = routeOperation(url.pathname);
  if (operation === null) {
    return json({ error: 'not_found' }, 404);
  }

  let rateLimitResult: unknown;
  try {
    rateLimitResult = await dependencies.rateLimit(clientRateLimitKey(request));
  } catch {
    return json({ error: 'rate_limiter_unavailable' }, 503);
  }

  if (!isRateLimitResult(rateLimitResult)) {
    return json({ error: 'rate_limiter_unavailable' }, 503);
  }

  if (!rateLimitResult.success) {
    return json(
      {
        error: 'rate_limited',
        retryAfterSeconds: COORDINATION_RATE_LIMIT_PERIOD_SECONDS,
      },
      429,
      { 'Retry-After': String(COORDINATION_RATE_LIMIT_PERIOD_SECONDS) },
    );
  }

  const namespace = await sha256Hex(token);
  const decision = await dependencies.executeFiscal(operation, namespace);
  return decisionResponse(decision);
}

function clientRateLimitKey(request: Request): string {
  const raw = request.headers.get('CF-Connecting-IP')?.trim() ?? '';
  const normalized = /^[0-9A-Fa-f:.]{3,45}$/.test(raw) ? raw.toLowerCase() : 'unknown';
  return `ip:${normalized}`;
}

function routeOperation(pathname: string): FiscalOperation | null {
  if (pathname === '/api/fiscal-coordination/reserve') {
    return 'reserve';
  }

  if (pathname === '/api/fiscal-coordination/block') {
    return 'block';
  }

  return null;
}

function bearerToken(value: string | null): string | null {
  if (!value?.startsWith('Bearer ')) {
    return null;
  }

  const token = value.slice('Bearer '.length).trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

function isRateLimitResult(value: unknown): value is Readonly<{ success: boolean }> {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { success?: unknown }).success === 'boolean';
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decisionResponse(decision: FiscalCoordinationDecision): Response {
  return json({
    allowDirectLookup: decision.allowDirectLookup,
    blockedUntilUtc: decision.blockedUntilUtc === null
      ? null
      : new Date(decision.blockedUntilUtc).toISOString(),
    reason: decision.reason,
  });
}

function json(
  payload: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}
