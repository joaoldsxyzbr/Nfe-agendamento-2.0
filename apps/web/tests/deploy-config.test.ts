import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const rootWranglerUrl = new URL('../../../wrangler.jsonc', import.meta.url);
const rootLockUrl = new URL('../../../package-lock.json', import.meta.url);
const headersUrl = new URL('../public/_headers', import.meta.url);
const ciUrl = new URL('../../../.github/workflows/ci.yml', import.meta.url);
const mainUrl = new URL('../src/main.ts', import.meta.url);
const consultationControllerUrl = new URL('../src/nfe/consultation-controller.ts', import.meta.url);

describe('Cloudflare deploy configuration', () => {
  it('supports the root deploy command used by Workers Builds', async () => {
    const raw = await readFile(rootWranglerUrl, 'utf8');
    const config = JSON.parse(raw) as {
      name?: string;
      build?: { command?: string };
      assets?: { directory?: string };
    };

    expect(config.name).toBe('nfe-agendamento-2');
    expect(config.build?.command).toBe('npm run build:web');
    expect(config.assets?.directory).toBe('./apps/web/dist');
  });

  it('runs update metadata and installer downloads through the Worker before static assets', async () => {
    const raw = await readFile(rootWranglerUrl, 'utf8');
    const config = JSON.parse(raw) as {
      assets?: { run_worker_first?: string[] };
    };

    expect(config.assets?.run_worker_first).toEqual(expect.arrayContaining([
      '/api/update/*',
      '/downloads/windows/*',
    ]));
  });

  it('configures bounded rate limiters for fiscal coordination and update traffic', async () => {
    const raw = await readFile(rootWranglerUrl, 'utf8');
    const config = JSON.parse(raw) as {
      ratelimits?: Array<{
        name?: string;
        simple?: { limit?: number; period?: number };
      }>;
    };

    expect(config.ratelimits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'COORDINATION_RATE_LIMITER',
        simple: { limit: 60, period: 60 },
      }),
      expect.objectContaining({
        name: 'UPDATE_RATE_LIMITER',
        simple: { limit: 30, period: 60 },
      }),
    ]));
  });

  it('pins npm dependencies and uses npm ci in CI', async () => {
    await expect(access(rootLockUrl)).resolves.toBeUndefined();
    const ci = await readFile(ciUrl, 'utf8');
    expect(ci).toContain('- run: npm ci');
    expect(ci).not.toContain('- run: npm install');
  });

  it('blocks high npm advisories and builds desktop artifacts on a pinned Windows runner', async () => {
    const ci = await readFile(ciUrl, 'utf8');
    expect(ci).toContain('- run: npm audit --audit-level=high');

    const bridgeJob = ci.match(/\r?\n  bridge:\r?\n([\s\S]*?)\r?\n  windows-package:/)?.[1] ?? '';
    const windowsJob = ci.match(/\r?\n  windows-package:\r?\n([\s\S]*)$/)?.[1] ?? '';
    expect(bridgeJob).not.toContain('apps/bridge/windows/NfeAgendamento.Portal');
    expect(bridgeJob).not.toContain('apps/bridge/windows/NfeAgendamento.App');
    expect(windowsJob).toContain('runs-on: windows-2025');
    expect(windowsJob).not.toContain('runs-on: windows-latest');
    expect(windowsJob).toContain('NfeAgendamento.Portal.csproj');
    expect(windowsJob).not.toContain('NfeAgendamento.App.csproj');
  });

  it('ships restrictive security headers without breaking the local Bridge', async () => {
    const headers = await readFile(headersUrl, 'utf8');
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("connect-src 'self' http://127.0.0.1:17345");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: no-referrer');
    expect(headers).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=()');
  });

  it('does not advertise Portal before an eligible SEFAZ fallback result occurs', async () => {
    const main = await readFile(mainUrl, 'utf8');
    const consultationController = await readFile(consultationControllerUrl, 'utf8');
    const normalHelp = main.match(/<p id="lookup-help"[^>]*>(.*?)<\/p>/s)?.[1] ?? '';
    expect(normalHelp).not.toContain('Portal');
    expect(consultationController).toContain("lookup.category === 'consumption_limit'");
    expect(consultationController).toContain("lookup.category === 'fiscal_status' && lookup.cStat === '217'");
  });
});
