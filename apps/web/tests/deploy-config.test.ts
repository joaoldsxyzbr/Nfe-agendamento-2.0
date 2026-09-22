import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const rootWranglerUrl = new URL('../../../wrangler.jsonc', import.meta.url);
const rootLockUrl = new URL('../../../package-lock.json', import.meta.url);
const headersUrl = new URL('../public/_headers', import.meta.url);
const ciUrl = new URL('../../../.github/workflows/ci.yml', import.meta.url);

describe('Cloudflare deploy configuration', () => {
  it('serves only the built web assets through the Worker', async () => {
    const config = JSON.parse(await readFile(rootWranglerUrl, 'utf8')) as any;
    expect(config.name).toBe('nfe-agendamento-2');
    expect(config.build?.command).toBe('npm run build:web');
    expect(config.assets?.directory).toBe('./apps/web/dist');
    expect(config.assets?.run_worker_first).toBeUndefined();
    expect(config.ratelimits).toBeUndefined();
    expect(config.durable_objects).toBeUndefined();
  });

  it('keeps the one-time Durable Object deletion tombstone', async () => {
    const config = JSON.parse(await readFile(rootWranglerUrl, 'utf8')) as any;
    expect(config.exports?.FiscalCoordinator).toEqual({
      type: 'durable-object',
      state: 'deleted',
    });
  });

  it('pins npm dependencies and CI to web + extension + browser/DANFE gates', async () => {
    await expect(access(rootLockUrl)).resolves.toBeUndefined();
    const ci = await readFile(ciUrl, 'utf8');
    expect(ci).toContain('- run: npm ci');
    expect(ci).toContain('- run: npm audit --audit-level=high');
    expect(ci).toContain('  web:');
    expect(ci).toContain('  extension:');
    expect(ci).toContain('  danfe-print:');
    expect(ci).not.toContain('  bridge:');
    expect(ci).not.toContain('windows-package:');
    expect(ci).not.toContain('fiscal-compatibility:');
    expect(ci).not.toContain('setup-dotnet');
  });

  it('ships restrictive headers without a localhost exception', async () => {
    const headers = await readFile(headersUrl, 'utf8');
    expect(headers).toContain("default-src 'self'");
    expect(headers).toContain("connect-src 'self'");
    expect(headers).not.toContain('127.0.0.1:17345');
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Content-Type-Options: nosniff');
  });
});
