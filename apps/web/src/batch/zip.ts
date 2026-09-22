export type ZipTextFile = {
  name: string;
  content: string;
};

const encoder = new TextEncoder();
const UTF8_FLAG = 0x0800;
const DEFAULT_MAX_ZIP_BYTES = 256 * 1024 * 1024;

export function createStoredZip(
  files: readonly ZipTextFile[],
  maxBytes = DEFAULT_MAX_ZIP_BYTES,
): Blob {
  if (files.length === 0) throw new Error('Nenhum arquivo disponível para o ZIP.');
  if (files.length > 0xffff) throw new Error('Quantidade de arquivos excede o limite do ZIP.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 22) {
    throw new Error('Limite de tamanho do ZIP inválido.');
  }

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  let projectedArchiveBytes = 22;

  for (const file of files) {
    const name = sanitizeName(file.name);
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, UTF8_FLAG, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, UTF8_FLAG, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);

    projectedArchiveBytes += localHeader.length + data.length + centralHeader.length;
    if (projectedArchiveBytes > maxBytes) {
      throw new Error('O lote excede o tamanho seguro para gerar o ZIP no navegador.');
    }

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  }

  const centralOffset = localOffset;
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  endView.setUint16(20, 0, true);

  const parts = [...localParts, ...centralParts, end];
  return new Blob(parts as BlobPart[], { type: 'application/zip' });
}

function sanitizeName(name: string): string {
  const normalized = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!normalized) throw new Error('Nome de arquivo inválido para o ZIP.');
  return normalized;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
