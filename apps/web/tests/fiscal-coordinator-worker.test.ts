import { describe, expect, it } from 'vitest';
import { handleFiscalCoordinationRequest } from '../../../worker/fiscal-coordination-http';

const validToken = 'A'.repeat(43);
const auth = { Authorization: `Bearer ${validToken}` };
const allowedDecision = {
  allowDirectLookup: true,
  blockedUntilUtc: null,
  reason: null,
};

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://nfeagendamento.joaolds.xyz.br${path}`, {
    method: 'POST',
    headers: auth,
    ...init,
  });
}

function requireResponse(response: Response | null): Response {
  if (response === null) {
    throw new Error('expected HTTP response');
  }

  return response;
}

describe('fiscal coordination worker HTTP gate', () => {
  it('returns 405 before rate limiting for non-POST requests', async () => {
    let rateCalls = 0;
    let fiscalCalls = 0;
    const response = requireResponse(await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve', { method: 'GET' }),
      {
        rateLimit: async () => {
          rateCalls += 1;
          return { success: true };
        },
        executeFiscal: async () => {
          fiscalCalls += 1;
          return allowedDecision;
        },
      },
    ));

    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect(rateCalls).toBe(0);
    expect(fiscalCalls).toBe(0);
  });

  it('returns 401 for an invalid bearer without calling protected resources', async () => {
    let rateCalls = 0;
    let fiscalCalls = 0;
    const response = requireResponse(await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve', {
        headers: { Authorization: 'Bearer invalid' },
      }),
      {
        rateLimit: async () => {
          rateCalls += 1;
          return { success: true };
        },
        executeFiscal: async () => {
          fiscalCalls += 1;
          return allowedDecision;
        },
      },
    ));

    expect(response.status).toBe(401);
    expect(rateCalls).toBe(0);
    expect(fiscalCalls).toBe(0);
  });

  it('returns 404 for an unknown coordination route before rate limiting', async () => {
    let rateCalls = 0;
    let fiscalCalls = 0;
    const response = requireResponse(await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/unknown'),
      {
        rateLimit: async () => {
          rateCalls += 1;
          return { success: true };
        },
        executeFiscal: async () => {
          fiscalCalls += 1;
          return allowedDecision;
        },
      },
    ));

    expect(response.status).toBe(404);
    expect(rateCalls).toBe(0);
    expect(fiscalCalls).toBe(0);
  });

  it('returns 429 with Retry-After when the Cloudflare limiter denies the request', async () => {
    let fiscalCalls = 0;
    const response = requireResponse(await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve'),
      {
        rateLimit: async () => ({ success: false }),
        executeFiscal: async () => {
          fiscalCalls += 1;
          return allowedDecision;
        },
      },
    ));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    await expect(response.json()).resolves.toEqual({
      error: 'rate_limited',
      retryAfterSeconds: 60,
    });
    expect(fiscalCalls).toBe(0);
  });

  it('fails closed with 503 when the limiter is unavailable', async () => {
    let fiscalCalls = 0;
    const response = requireResponse(await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve'),
      {
        rateLimit: async () => {
          throw new Error('limiter unavailable');
        },
        executeFiscal: async () => {
          fiscalCalls += 1;
          return allowedDecision;
        },
      },
    ));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'rate_limiter_unavailable' });
    expect(fiscalCalls).toBe(0);
  });

  it.each([
    ['/api/fiscal-coordination/reserve', 'reserve'],
    ['/api/fiscal-coordination/block', 'block'],
  ] as const)('dispatches %s to the matching fiscal operation after the gate', async (path, expectedOperation) => {
    const operations: string[] = [];
    const response = requireResponse(await handleFiscalCoordinationRequest(request(path), {
      rateLimit: async () => ({ success: true }),
      executeFiscal: async (operation, namespace) => {
        operations.push(`${operation}:${namespace.length}`);
        return allowedDecision;
      },
    }));

    expect(response.status).toBe(200);
    expect(operations).toEqual([`${expectedOperation}:64`]);
  });

  it('returns null for non-coordination routes so index.ts can delegate to assets', async () => {
    const response = await handleFiscalCoordinationRequest(request('/'), {
      rateLimit: async () => ({ success: true }),
      executeFiscal: async () => allowedDecision,
    });

    expect(response).toBeNull();
  });
});
