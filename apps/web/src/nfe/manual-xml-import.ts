import { parseNfeXml, type ParsedNfe } from './xml';

export const MAX_XML_BYTES = 10 * 1024 * 1024;

export async function validateManualNfeXml(
  file: File | null,
  expectedAccessKey: string,
): Promise<ParsedNfe | null> {
  if (!file) return null;

  if (!file.name.toLowerCase().endsWith('.xml')) {
    throw new Error('Selecione um arquivo XML.');
  }

  if (file.size === 0) {
    throw new Error('O arquivo XML está vazio.');
  }

  if (file.size > MAX_XML_BYTES) {
    throw new Error('O arquivo XML excede o limite de 10 MiB.');
  }

  const xml = await file.text();
  if (!xml.trim()) {
    throw new Error('O arquivo XML está vazio.');
  }

  return parseNfeXml(xml, expectedAccessKey);
}
