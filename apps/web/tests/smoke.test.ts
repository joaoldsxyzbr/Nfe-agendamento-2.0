import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contractsUrl = new URL('../src/bridge/contracts.ts', import.meta.url);

describe('web bootstrap', () => {
  it('requires the bridge endpoint to stay fixed on loopback', () => {
    expect(existsSync(contractsUrl)).toBe(true);
    if (!existsSync(contractsUrl)) return;

    const source = readFileSync(contractsUrl, 'utf8');
    expect(source).toContain("http://127.0.0.1:17345/api/v1");
  });
});
