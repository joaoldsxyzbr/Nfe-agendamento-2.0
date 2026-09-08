import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const rootWranglerUrl = new URL('../../../wrangler.jsonc', import.meta.url);

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
});
