import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateManualNfeXml } from '../src/nfe/manual-xml-import';

const KEY = '42260812345678000123550010000012341000012342';
const OTHER_KEY = '41260612345678000195550010000001231876543214';
const validXml = readFileSync(new URL('./fixtures/nfe-basic.xml', import.meta.url), 'utf8');

function xmlFile(content: string, name = 'nota.xml'): File {
  return new File([content], name, { type: 'application/xml' });
}

describe('manual XML import', () => {
  it('parses a valid XML only for the expected access key', async () => {
    const parsed = await validateManualNfeXml(xmlFile(validXml), KEY);

    expect(parsed?.accessKey).toBe(KEY);
    expect(parsed?.originalXml).toBe(validXml);
  });

  it('rejects XML for another access key', async () => {
    await expect(validateManualNfeXml(xmlFile(validXml), OTHER_KEY))
      .rejects.toThrow('A chave do XML não corresponde à NF-e consultada.');
  });

  it('rejects empty XML files', async () => {
    await expect(validateManualNfeXml(xmlFile(''), KEY))
      .rejects.toThrow('O arquivo XML está vazio.');
  });

  it('rejects files larger than 10 MiB before parsing', async () => {
    const oversized = new File(
      [new Uint8Array((10 * 1024 * 1024) + 1)],
      'nota.xml',
      { type: 'application/xml' },
    );

    await expect(validateManualNfeXml(oversized, KEY))
      .rejects.toThrow('O arquivo XML excede o limite de 10 MiB.');
  });

  it('rejects non-XML file names', async () => {
    await expect(validateManualNfeXml(xmlFile(validXml, 'nota.txt'), KEY))
      .rejects.toThrow('Selecione um arquivo XML.');
  });

  it('treats a cancelled file selector as a no-op', async () => {
    await expect(validateManualNfeXml(null, KEY)).resolves.toBeNull();
  });
});
