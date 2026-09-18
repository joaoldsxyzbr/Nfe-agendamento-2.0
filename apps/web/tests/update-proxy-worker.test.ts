import { describe, expect, it } from 'vitest';
import { handleUpdateRequest } from '../../../worker/update-proxy';

const origin = 'https://nfeagendamento.joaolds.xyz.br';
const tag = 'v0.0.16';
const name = 'NFeAgendamentoBridge-Setup-v0.0.16.exe';
const digest = 'sha256:' + 'a'.repeat(64);

function latestRelease() {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      {
        name,
        state: 'uploaded',
        size: 3,
        digest,
        browser_download_url: `https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/${tag}/${name}`,
      },
    ],
  };
}

function requireResponse(response: Response | null): Response {
  if (response === null) throw new Error('expected update response');
  return response;
}

describe('update proxy worker', () => {
  it('rewrites latest release metadata to the official application origin', async () => {
    const seen: string[] = [];
    const response = requireResponse(await handleUpdateRequest(
      new Request(`${origin}/api/update/latest`),
      {
        fetchUpstream: async (request: Request) => {
          seen.push(request.url);
          return new Response(JSON.stringify(latestRelease()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      'https://api.github.com/repos/joaoldsxyzbr/Nfe-agendamento-2.0/releases/latest',
    ]);
    const body = await response.json() as ReturnType<typeof latestRelease>;
    expect(body.assets[0]?.browser_download_url).toBe(
      `${origin}/downloads/windows/${tag}/${name}`,
    );
    expect(JSON.stringify(body)).not.toContain('github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download');
  });

  it('streams only the exact official Windows installer through the application origin', async () => {
    const seen: string[] = [];
    const bytes = new Uint8Array([1, 2, 3]);
    const response = requireResponse(await handleUpdateRequest(
      new Request(`${origin}/downloads/windows/${tag}/${name}`),
      {
        fetchUpstream: async (request: Request) => {
          seen.push(request.url);
          return new Response(bytes, {
            status: 200,
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(bytes.byteLength),
            },
          });
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      `https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/${tag}/${name}`,
    ]);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('Content-Disposition')).toContain(name);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('rejects malformed download paths without contacting GitHub', async () => {
    let calls = 0;
    const response = requireResponse(await handleUpdateRequest(
      new Request(`${origin}/downloads/windows/${tag}/other.exe`),
      {
        fetchUpstream: async () => {
          calls += 1;
          return new Response('unexpected');
        },
      },
    ));

    expect(response.status).toBe(404);
    expect(calls).toBe(0);
  });

  it('maps an upstream gateway timeout to a controlled 502 response', async () => {
    const response = requireResponse(await handleUpdateRequest(
      new Request(`${origin}/downloads/windows/${tag}/${name}`),
      {
        fetchUpstream: async () => new Response('Gateway Time-out', { status: 504 }),
      },
    ));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'update_source_unavailable' });
  });

  it('rate limits update traffic by Cloudflare client IP before contacting GitHub', async () => {
    let upstreamCalls = 0;
    let observedKey: unknown = null;
    const deps = {
      fetchUpstream: async () => {
        upstreamCalls += 1;
        return new Response(JSON.stringify(latestRelease()), { status: 200 });
      },
      rateLimit: async (...args: unknown[]) => {
        observedKey = args[0];
        return { success: false };
      },
      cacheMatch: async () => undefined,
      cachePut: async () => undefined,
    } as unknown as Parameters<typeof handleUpdateRequest>[1];

    const response = requireResponse(await handleUpdateRequest(
      new Request(`${origin}/api/update/latest`, {
        headers: { 'CF-Connecting-IP': '203.0.113.9' },
      }),
      deps,
    ));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(upstreamCalls).toBe(0);
    expect(observedKey).toBe('ip:203.0.113.9');
  });

  it('serves cached latest metadata without repeating the GitHub API request', async () => {
    let upstreamCalls = 0;
    const cache = new Map<string, Response>();
    const deps = {
      fetchUpstream: async () => {
        upstreamCalls += 1;
        return new Response(JSON.stringify(latestRelease()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      rateLimit: async () => ({ success: true }),
      cacheMatch: async (request: Request) => cache.get(request.url)?.clone(),
      cachePut: async (request: Request, response: Response) => {
        cache.set(request.url, response.clone());
      },
    } as unknown as Parameters<typeof handleUpdateRequest>[1];

    const request = () => new Request(`${origin}/api/update/latest`, {
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
    });
    const first = requireResponse(await handleUpdateRequest(request(), deps));
    const second = requireResponse(await handleUpdateRequest(request(), deps));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(upstreamCalls).toBe(1);
    expect(second.headers.get('X-NFe-Update-Cache')).toBe('HIT');
  });

  it('returns null for unrelated routes', async () => {
    const response = await handleUpdateRequest(new Request(`${origin}/`), {
      fetchUpstream: async () => new Response('unused'),
    });
    expect(response).toBeNull();
  });
});
