import { describe, expect, it } from 'vitest';
import { createStoredZip } from '../src/batch/zip';

describe('batch ZIP', () => {
  it('creates a ZIP with local and end signatures and file names', async () => {
    const blob = createStoredZip([
      { name: 'nota-1.xml', content: '<nfe>1</nfe>' },
      { name: 'nota-2.xml', content: '<nfe>2</nfe>' },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(blob.type).toBe('application/zip');
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(text).toContain('nota-1.xml');
    expect(text).toContain('nota-2.xml');
    expect(Array.from(bytes.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it('rejects empty archives', () => {
    expect(() => createStoredZip([])).toThrow('Nenhum arquivo disponível');
  });

  it('rejects an archive whose aggregate size exceeds the configured safety budget', () => {
    expect(() => createStoredZip([
      { name: 'nota-1.xml', content: '1234567890' },
      { name: 'nota-2.xml', content: 'abcdefghij' },
    ], 16)).toThrow('tamanho seguro');
  });
});
