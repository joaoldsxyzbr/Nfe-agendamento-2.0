const UPDATE_METADATA_URL = '/api/update/latest';
const TAG_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const DOWNLOAD_ORIGIN = 'https://nfeagendamento.joaolds.xyz.br';

export type WindowsUpdate = {
  latestVersion: string;
  downloadUrl: string;
  size: number;
  digest: string;
};

type ReleaseMetadata = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: [{
    name: string;
    state: string;
    size: number;
    digest: string;
    browser_download_url: string;
  }];
};

export async function checkWindowsUpdate(
  currentVersion: string,
  fetchFn: typeof fetch = fetch,
): Promise<WindowsUpdate | null> {
  const response = await fetchFn(UPDATE_METADATA_URL, {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Fonte de atualização indisponível');
  }

  const payload: unknown = await response.json();
  if (!isReleaseMetadata(payload)) {
    throw new Error('Metadata de atualização inválida');
  }

  const latest = parseVersion(payload.tag_name.slice(1));
  const installed = parseVersion(currentVersion);
  if (!latest || !installed) {
    throw new Error('Metadata de atualização inválida');
  }

  if (compareVersions(latest, installed) <= 0) {
    return null;
  }

  const asset = payload.assets[0];
  return {
    latestVersion: latest.join('.'),
    downloadUrl: asset.browser_download_url,
    size: asset.size,
    digest: asset.digest,
  };
}

function isReleaseMetadata(value: unknown): value is ReleaseMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Record<string, unknown>;
  if (typeof release.tag_name !== 'string' || !TAG_PATTERN.test(release.tag_name)) return false;
  if (release.draft !== false || release.prerelease !== false) return false;
  if (!Array.isArray(release.assets) || release.assets.length !== 1) return false;

  const asset = release.assets[0];
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return false;
  const candidate = asset as Record<string, unknown>;
  const expectedName = `NFeAgendamentoBridge-Setup-${release.tag_name}.exe`;

  if (candidate.name !== expectedName || candidate.state !== 'uploaded') return false;
  if (typeof candidate.size !== 'number' || !Number.isSafeInteger(candidate.size) || candidate.size <= 0) return false;
  if (typeof candidate.digest !== 'string' || !SHA256_PATTERN.test(candidate.digest)) return false;
  if (typeof candidate.browser_download_url !== 'string') return false;

  try {
    const url = new URL(candidate.browser_download_url);
    const expectedPath = `/downloads/windows/${release.tag_name}/${expectedName}`;
    return url.origin === DOWNLOAD_ORIGIN &&
      url.protocol === 'https:' &&
      url.pathname === expectedPath &&
      url.search === '' &&
      url.hash === '';
  } catch {
    return false;
  }
}

function parseVersion(value: string): readonly [number, number, number] | null {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:\.0)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}
