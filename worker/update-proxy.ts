const GITHUB_LATEST_RELEASE =
  'https://api.github.com/repos/joaoldsxyzbr/Nfe-agendamento-2.0/releases/latest';
const GITHUB_DOWNLOAD_PREFIX =
  'https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/';
const DOWNLOAD_PREFIX = '/downloads/windows/';
const TAG_PATTERN = /^v\d+\.\d+\.\d+$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/i;

type UpdateProxyDependencies = Readonly<{
  fetchUpstream: (request: Request) => Promise<Response>;
  rateLimit?: (key: string) => Promise<unknown>;
  cacheMatch?: (request: Request) => Promise<Response | undefined>;
  cachePut?: (request: Request, response: Response) => Promise<void>;
}>;

type GithubAsset = Readonly<{
  name?: unknown;
  state?: unknown;
  size?: unknown;
  digest?: unknown;
  browser_download_url?: unknown;
}>;

type GithubRelease = Readonly<{
  tag_name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
}>;

export async function handleUpdateRequest(
  request: Request,
  dependencies: UpdateProxyDependencies,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === '/api/update/latest') {
    if (request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
    }

    const rateLimited = await applyRateLimit(request, dependencies);
    if (rateLimited) return rateLimited;

    const cacheKey = new Request(url.toString(), { method: 'GET' });
    try {
      const cached = await dependencies.cacheMatch?.(cacheKey);
      if (cached) return withHeader(cached, 'X-NFe-Update-Cache', 'HIT');
    } catch {
      // Cache é otimização: falha do edge cache não bloqueia atualização.
    }

    const response = await proxyLatestRelease(url.origin, dependencies);
    if (!response.ok) return response;

    const cacheable = withHeader(response, 'X-NFe-Update-Cache', 'MISS');
    try {
      await dependencies.cachePut?.(cacheKey, cacheable.clone());
    } catch {
      // Cache é best-effort; a resposta validada ainda pode ser usada.
    }
    return cacheable;
  }

  if (url.pathname.startsWith(DOWNLOAD_PREFIX)) {
    if (request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405, { Allow: 'GET' });
    }

    const rateLimited = await applyRateLimit(request, dependencies);
    if (rateLimited) return rateLimited;
    return proxyInstaller(url.pathname, dependencies);
  }

  return null;
}

async function proxyLatestRelease(
  origin: string,
  dependencies: UpdateProxyDependencies,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await dependencies.fetchUpstream(new Request(GITHUB_LATEST_RELEASE, {
      method: 'GET',
      headers: githubHeaders('NFeAgendamentoUpdateProxy/1.0'),
      redirect: 'follow',
    }));
  } catch {
    return unavailable();
  }

  if (!upstream.ok) {
    return unavailable();
  }

  let release: GithubRelease;
  try {
    release = await upstream.json() as GithubRelease;
  } catch {
    return unavailable();
  }

  const tag = typeof release.tag_name === 'string' ? release.tag_name : '';
  if (!TAG_PATTERN.test(tag) || release.draft === true || release.prerelease === true) {
    return unavailable();
  }

  const expectedName = `NFeAgendamentoBridge-Setup-${tag}.exe`;
  const asset = Array.isArray(release.assets)
    ? release.assets.find((candidate): candidate is GithubAsset =>
        isObject(candidate) && candidate.name === expectedName)
    : undefined;

  if (!asset ||
      asset.state !== 'uploaded' ||
      typeof asset.size !== 'number' ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      typeof asset.digest !== 'string' ||
      !SHA256_PATTERN.test(asset.digest) ||
      typeof asset.browser_download_url !== 'string') {
    return unavailable();
  }

  const expectedGithubUrl = `${GITHUB_DOWNLOAD_PREFIX}${tag}/${expectedName}`;
  if (asset.browser_download_url !== expectedGithubUrl) {
    return unavailable();
  }

  return json({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: expectedName,
        state: 'uploaded',
        size: asset.size,
        digest: asset.digest,
        browser_download_url: `${origin}${DOWNLOAD_PREFIX}${tag}/${expectedName}`,
      },
    ],
  }, 200, {
    'Cache-Control': 'public, max-age=60, s-maxage=300',
  });
}

async function proxyInstaller(
  pathname: string,
  dependencies: UpdateProxyDependencies,
): Promise<Response> {
  const parsed = parseInstallerPath(pathname);
  if (!parsed) {
    return json({ error: 'not_found' }, 404);
  }

  const upstreamUrl = `${GITHUB_DOWNLOAD_PREFIX}${parsed.tag}/${parsed.name}`;
  let upstream: Response;
  try {
    upstream = await dependencies.fetchUpstream(new Request(upstreamUrl, {
      method: 'GET',
      headers: githubHeaders('NFeAgendamentoDownloadProxy/1.0'),
      redirect: 'follow',
    }));
  } catch {
    return unavailable();
  }

  if (!upstream.ok || upstream.body === null) {
    return unavailable();
  }

  const headers = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${parsed.name}"`,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });

  const contentLength = upstream.headers.get('Content-Length');
  if (contentLength) {
    headers.set('Content-Length', contentLength);
  }

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}

function parseInstallerPath(pathname: string): Readonly<{ tag: string; name: string }> | null {
  const match = pathname.match(
    /^\/downloads\/windows\/(v\d+\.\d+\.\d+)\/(NFeAgendamentoBridge-Setup-(v\d+\.\d+\.\d+)\.exe)$/,
  );
  if (!match || match[1] !== match[3]) {
    return null;
  }

  return { tag: match[1], name: match[2] };
}

async function applyRateLimit(
  request: Request,
  dependencies: UpdateProxyDependencies,
): Promise<Response | null> {
  if (!dependencies.rateLimit) return null;

  let result: unknown;
  try {
    result = await dependencies.rateLimit(clientRateLimitKey(request));
  } catch {
    return json({ error: 'rate_limiter_unavailable' }, 503);
  }

  if (!isRateLimitResult(result)) {
    return json({ error: 'rate_limiter_unavailable' }, 503);
  }

  if (!result.success) {
    return json(
      { error: 'rate_limited', retryAfterSeconds: 60 },
      429,
      { 'Retry-After': '60' },
    );
  }

  return null;
}

function clientRateLimitKey(request: Request): string {
  const raw = request.headers.get('CF-Connecting-IP')?.trim() ?? '';
  const normalized = /^[0-9A-Fa-f:.]{3,45}$/.test(raw) ? raw.toLowerCase() : 'unknown';
  return `ip:${normalized}`;
}

function isRateLimitResult(value: unknown): value is Readonly<{ success: boolean }> {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { success?: unknown }).success === 'boolean';
}

function withHeader(response: Response, name: string, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function githubHeaders(userAgent: string): Headers {
  return new Headers({
    Accept: 'application/vnd.github+json',
    'User-Agent': userAgent,
    'X-GitHub-Api-Version': '2022-11-28',
  });
}

function unavailable(): Response {
  return json({ error: 'update_source_unavailable' }, 502, {
    'Cache-Control': 'no-store',
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
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
