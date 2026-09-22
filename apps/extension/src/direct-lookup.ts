import { loadFiscalIdentity } from './fiscal-config';
import { blockFiscalUsage, reserveFiscalAttempt } from './fiscal-usage';
import { validateXmlPayload } from './protocol';

const ENDPOINT =
  'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 45_000;

export type DirectLookupCategory =
  | 'success'
  | 'fiscal_status'
  | 'consumption_limit'
  | 'certificate_error'
  | 'transport_unavailable'
  | 'technical_error';

export type DirectLookupResult = Readonly<{
  category: DirectLookupCategory;
  xml: string | null;
  cStat: string | null;
  message: string | null;
}>;

export async function lookupNfeDirect(accessKey: string): Promise<DirectLookupResult> {
  const identity = await loadFiscalIdentity();
  if (!identity) {
    return result(
      'certificate_error',
      null,
      null,
      'Configure o CNPJ do certificado A1 nas opções da extensão antes da consulta direta.',
    );
  }

  const decision = await reserveFiscalAttempt(identity.cnpj);
  if (!decision.allowDirectLookup) {
    const localTime = decision.blockedUntil
      ? new Date(decision.blockedUntil).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'mais tarde';
    return result(
      'consumption_limit',
      null,
      null,
      `Proteção fiscal local ativa até ${localTime}. A SEFAZ não foi consultada novamente.`,
    );
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'text/xml; charset=utf-8',
        },
        body: buildDistributionSoap(accessKey, identity.cnpj),
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        return result(
          'transport_unavailable',
          null,
          null,
          'A consulta direta à SEFAZ excedeu o tempo limite. A tentativa não será repetida automaticamente.',
        );
      }
      return result(
        'transport_unavailable',
        null,
        null,
        'Não foi possível confirmar o resultado da comunicação direta com a SEFAZ. A tentativa não será repetida automaticamente.',
      );
    }

    if (response.status === 429) {
      await blockFiscalUsage(identity.cnpj);
      return result(
        'consumption_limit',
        null,
        null,
        'A SEFAZ recusou a consulta por excesso de requisições. A tentativa não será repetida automaticamente.',
      );
    }

    if (!response.ok) {
      return result(
        'transport_unavailable',
        null,
        String(response.status),
        `A consulta direta à SEFAZ retornou HTTP ${response.status}.`,
      );
    }

    const body = await readTextLimited(response, MAX_RESPONSE_BYTES);
    const parsed = await parseDistributionResponse(body, accessKey);

    if (parsed.cStat === '656') {
      await blockFiscalUsage(identity.cnpj);
      return result('consumption_limit', null, parsed.cStat, parsed.message);
    }

    if (parsed.cStat === '138' && parsed.xml) {
      return result('success', parsed.xml, parsed.cStat, parsed.message);
    }

    return result('fiscal_status', null, parsed.cStat, parsed.message);
  } catch (error) {
    return result(
      'technical_error',
      null,
      null,
      error instanceof Error
        ? error.message
        : 'A resposta da SEFAZ não pôde ser validada com segurança.',
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function buildDistributionSoap(accessKey: string, cnpj: string): string {
  if (!/^[0-9A-Z]{44}$/.test(accessKey)) throw new Error('Chave NF-e inválida.');
  if (!/^[0-9]{14}$/.test(cnpj)) throw new Error('CNPJ fiscal inválido.');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>1</tpAmb>
          <CNPJ>${cnpj}</CNPJ>
          <consChNFe><chNFe>${accessKey}</chNFe></consChNFe>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`;
}

export async function parseDistributionResponse(
  responseXml: string,
  accessKey: string,
): Promise<Readonly<{ cStat: string; message: string; xml: string | null }>> {
  if (!responseXml.trim()) throw new Error('Resposta vazia da SEFAZ.');
  if (/<!DOCTYPE/i.test(responseXml)) throw new Error('DTD não permitido na resposta da SEFAZ.');

  const cStat = extractTag(responseXml, 'cStat') ?? '';
  const message = decodeXmlText(
    extractTag(responseXml, 'xMotivo') ?? 'Resposta recebida da SEFAZ.',
  );
  if (cStat !== '138') return { cStat, message, xml: null };

  const pattern =
    /<(?:(?:[A-Za-z0-9_]+):)?docZip\b([^>]*)>([\s\S]*?)<\/(?:(?:[A-Za-z0-9_]+):)?docZip>/gi;

  for (const match of responseXml.matchAll(pattern)) {
    const attributes = match[1] ?? '';
    const schema = /\bschema\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] ?? '';
    if (!schema.toLowerCase().includes('procnfe')) continue;

    const xml = await decompressDocZip((match[2] ?? '').trim());
    try {
      return {
        cStat,
        message,
        xml: validateXmlPayload(xml, accessKey),
      };
    } catch {
      // Pode haver mais de um docZip; aceita somente o que corresponde à chave pedida.
    }
  }

  return { cStat, message, xml: null };
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('Resposta da SEFAZ excede o limite permitido.');
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error('Resposta da SEFAZ excede o limite permitido.');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('Resposta da SEFAZ excede o limite permitido.');
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(combined);
}

async function decompressDocZip(base64: string): Promise<string> {
  let compressed: Uint8Array;
  try {
    const binary = atob(base64.replace(/\s+/g, ''));
    compressed = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('docZip inválido.');
  }

  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('XML distribuído excede o limite permitido.');
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(combined);
}

function extractTag(xml: string, localName: string): string | null {
  const pattern = new RegExp(
    `<(?:(?:[A-Za-z0-9_]+):)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z0-9_]+):)?${localName}>`,
    'i',
  );
  return pattern.exec(xml)?.[1]?.trim() ?? null;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function result(
  category: DirectLookupCategory,
  xml: string | null,
  cStat: string | null,
  message: string | null,
): DirectLookupResult {
  return { category, xml, cStat, message };
}
