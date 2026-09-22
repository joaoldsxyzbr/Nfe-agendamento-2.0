import { ACCESS_KEY_PATTERN, MAX_XML_BYTES, validateXmlPayload } from './protocol';

export const SEFAZ_DISTRIBUTION_ENDPOINT =
  'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const REQUEST_TIMEOUT_MS = 45_000;

export type DirectLookupCategory =
  | 'success'
  | 'fiscal_status'
  | 'consumption_limit'
  | 'configuration_error'
  | 'transport_unavailable'
  | 'technical_error';

export type DirectLookupResult = Readonly<{
  category: DirectLookupCategory;
  xml: string | null;
  cStat: string | null;
  message: string;
}>;

export async function lookupNfeDirect(accessKey: string, cnpj: string, fetcher: typeof fetch = globalThis.fetch): Promise<DirectLookupResult> {
  const soap = buildDistributionSoap(accessKey, cnpj);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(SEFAZ_DISTRIBUTION_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8' },
      body: soap,
      credentials: 'include',
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
    });
  } catch {
    return {
      category: 'transport_unavailable',
      xml: null,
      cStat: null,
      message: controller.signal.aborted
        ? 'A consulta direta à SEFAZ excedeu 45 segundos. A tentativa não será repetida automaticamente.'
        : 'Não foi possível concluir a consulta direta à SEFAZ. Verifique o certificado A1 no Chrome/Edge e tente novamente.',
    };
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (response.status === 429) {
    return { category: 'consumption_limit', xml: null, cStat: null, message: 'A SEFAZ recusou a consulta por excesso de requisições.' };
  }
  if (!response.ok) {
    return {
      category: 'transport_unavailable',
      xml: null,
      cStat: null,
      message: `A consulta direta à SEFAZ retornou HTTP ${response.status}. A tentativa não será repetida automaticamente.`,
    };
  }

  let body: string;
  try { body = await readTextLimited(response, MAX_XML_BYTES); }
  catch {
    return { category: 'technical_error', xml: null, cStat: null, message: 'A resposta da SEFAZ excedeu o limite permitido ou não pôde ser lida com segurança.' };
  }

  try { return await parseDistributionResponse(body, accessKey); }
  catch {
    return { category: 'technical_error', xml: null, cStat: null, message: 'A resposta recebida da SEFAZ não pôde ser validada com segurança.' };
  }
}

export function buildDistributionSoap(accessKey: string, cnpj: string): string {
  const normalizedKey = accessKey.trim().toUpperCase();
  if (!ACCESS_KEY_PATTERN.test(normalizedKey)) throw new Error('Chave NF-e inválida.');
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) throw new Error('CNPJ inválido.');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>1</tpAmb>
          <CNPJ>${cnpj}</CNPJ>
          <consChNFe><chNFe>${normalizedKey}</chNFe></consChNFe>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`;
}

export async function parseDistributionResponse(responseXml: string, accessKey: string): Promise<DirectLookupResult> {
  if (!responseXml || /<!DOCTYPE/i.test(responseXml)) throw new Error('Resposta XML inválida.');
  const cStat = extractTagText(responseXml, 'cStat') ?? '';
  const message = decodeXmlEntities(extractTagText(responseXml, 'xMotivo') ?? 'Resposta recebida da SEFAZ.');
  if (!cStat) throw new Error('Resposta sem cStat.');
  if (cStat !== '138') {
    return { category: cStat === '656' ? 'consumption_limit' : 'fiscal_status', xml: null, cStat, message };
  }

  const docPattern = /<(?:[\w.-]+:)?docZip\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?docZip>/gi;
  for (const match of responseXml.matchAll(docPattern)) {
    const attributes = match[1] ?? '';
    const schema = /\bschema\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? '';
    if (!schema.toLowerCase().includes('procnfe')) continue;
    const base64 = decodeXmlEntities(match[2] ?? '').replace(/\s+/g, '');
    const xml = await decompressDocZip(base64);
    try { return { category: 'success', xml: validateXmlPayload(xml, accessKey), cStat, message }; }
    catch { /* continuar procurando o docZip da chave */ }
  }
  return { category: 'fiscal_status', xml: null, cStat, message };
}

async function decompressDocZip(base64: string): Promise<string> {
  if (!base64) throw new Error('docZip vazio.');
  let compressed: Uint8Array;
  try {
    const binary = atob(base64);
    compressed = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) compressed[index] = binary.charCodeAt(index);
  } catch {
    throw new Error('docZip inválido.');
  }
  const copy = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(copy).set(compressed);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder('utf-8').decode(await readStreamLimited(stream, MAX_XML_BYTES));
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('Resposta excede o limite permitido.');
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('Resposta excede o limite permitido.');
    return text;
  }
  return new TextDecoder('utf-8').decode(await readStreamLimited(response.body, maxBytes));
}

async function readStreamLimited(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('Conteúdo excede o limite permitido.');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function extractTagText(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`, 'i');
  return pattern.exec(xml)?.[1]?.trim() ?? null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
