import { describe, expect, it, vi } from 'vitest';
import { classifyBridgeFailure } from '../src/bridge/diagnostics';
import { checkWindowsUpdate } from '../src/update/windows-update';

const digest = `sha256:${'a'.repeat(64)}`;

function metadata(
  tag = 'v0.0.18',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const name = `NFeAgendamentoBridge-Setup-${tag}.exe`;
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [{
      name,
      state: 'uploaded',
      size: 123456,
      digest,
      browser_download_url: `https://nfeagendamento.joaolds.xyz.br/downloads/windows/${tag}/${name}`,
    }],
    ...overrides,
  };
}

describe('Windows update discovery', () => {
  it('returns the validated newer Setup metadata', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(checkWindowsUpdate('0.0.17', fetchFn)).resolves.toEqual({
      latestVersion: '0.0.18',
      downloadUrl: 'https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.18/NFeAgendamentoBridge-Setup-v0.0.18.exe',
      size: 123456,
      digest,
    });
    expect(fetchFn).toHaveBeenCalledWith('/api/update/latest', expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
    }));
  });

  it('returns null when the installed version is already current or newer', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(metadata()), { status: 200 }));

    await expect(checkWindowsUpdate('0.0.18', fetchFn)).resolves.toBeNull();
    await expect(checkWindowsUpdate('0.0.19', fetchFn)).resolves.toBeNull();
  });

  it.each([
    ['draft release', metadata('v0.0.18', { draft: true })],
    ['prerelease', metadata('v0.0.18', { prerelease: true })],
    ['unexpected asset name', {
      ...metadata(),
      assets: [{
        name: 'other.exe',
        state: 'uploaded',
        size: 123456,
        digest,
        browser_download_url: 'https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.18/other.exe',
      }],
    }],
    ['foreign download URL', {
      ...metadata(),
      assets: [{
        name: 'NFeAgendamentoBridge-Setup-v0.0.18.exe',
        state: 'uploaded',
        size: 123456,
        digest,
        browser_download_url: 'https://example.com/NFeAgendamentoBridge-Setup-v0.0.18.exe',
      }],
    }],
    ['invalid digest', {
      ...metadata(),
      assets: [{
        name: 'NFeAgendamentoBridge-Setup-v0.0.18.exe',
        state: 'uploaded',
        size: 123456,
        digest: 'sha256:bad',
        browser_download_url: 'https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.18/NFeAgendamentoBridge-Setup-v0.0.18.exe',
      }],
    }],
  ])('rejects %s', async (_name, payload) => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(checkWindowsUpdate('0.0.17', fetchFn)).rejects.toThrow('Metadata de atualização inválida');
  });
});

describe('Bridge diagnostics', () => {
  it('classifies transport failures conservatively as local access unavailable', () => {
    expect(classifyBridgeFailure(new DOMException('Aborted', 'AbortError'))).toBe('local_access_unavailable');
    expect(classifyBridgeFailure(new TypeError('fetch failed'))).toBe('local_access_unavailable');
  });

  it('distinguishes an incompatible Bridge contract without guessing other causes', () => {
    expect(classifyBridgeFailure(new Error('Resposta inválida do Bridge'))).toBe('incompatible');
    expect(classifyBridgeFailure(new Error('Bridge indisponível (403)'))).toBe('unknown');
  });
});
