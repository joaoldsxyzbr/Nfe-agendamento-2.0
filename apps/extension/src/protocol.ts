import { normalizeTaxId } from './supplier-store';

export const SITE_ORIGIN = 'https://nfeagendamento.joaolds.xyz.br' as const;
export const PORTAL_ORIGIN = 'https://www.nfe.fazenda.gov.br' as const;
export const PAGE_CHANNEL = 'nfe-agendamento:portal-extension' as const;
export const MAX_XML_BYTES = 10 * 1024 * 1024;
export const ACCESS_KEY_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/;

export type PortalExtensionState =
  | 'opening'
  | 'loading_portal'
  | 'waiting_user'
  | 'submitting'
  | 'waiting_result'
  | 'fetching_xml'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type SiteCommand =
  | { type: 'ping'; requestId: string }
  | { type: 'direct_lookup'; requestId: string; accessKey: string }
  | { type: 'start'; requestId: string; accessKey: string }
  | { type: 'status'; requestId: string; operationId: string }
  | { type: 'cancel'; requestId: string; operationId: string }
  | { type: 'resolve_supplier'; requestId: string; taxId: string };

export type ExtensionEvent =
  | { type: 'state'; operationId: string; state: PortalExtensionState; message?: string }
  | { type: 'completed'; operationId: string; xml: string }
  | { type: 'failed'; operationId: string; code: string; message: string }
  | { type: 'cancelled'; operationId: string; message?: string };

export function parseSiteCommand(value: unknown): SiteCommand {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Comando inválido.');
  }

  const input = value as Record<string, unknown>;
  const type = stringField(input, 'type');
  const requestId = stringField(input, 'requestId');

  if (type === 'ping') {
    return { type, requestId };
  }

  if (type === 'direct_lookup' || type === 'start') {
    const accessKey = stringField(input, 'accessKey').toUpperCase();
    if (!ACCESS_KEY_PATTERN.test(accessKey)) {
      throw new Error('Chave NF-e inválida.');
    }
    return { type, requestId, accessKey };
  }

  if (type === 'status' || type === 'cancel') {
    return { type, requestId, operationId: stringField(input, 'operationId') };
  }

  if (type === 'resolve_supplier') {
    const taxId = normalizeTaxId(stringField(input, 'taxId'));
    if (!taxId) throw new Error('Identificador fiscal inválido.');
    return { type, requestId, taxId };
  }

  throw new Error('Comando desconhecido.');
}

export function isTerminalPortalState(value: PortalExtensionState | string): boolean {
  return value === 'completed' || value === 'failed' || value === 'cancelled';
}

export function validateXmlPayload(xml: string, accessKey: string): string {
  if (typeof xml !== 'string' || xml.length === 0) {
    throw new Error('XML vazio.');
  }
  if (new TextEncoder().encode(xml).byteLength > MAX_XML_BYTES) {
    throw new Error('XML excede 10 MiB.');
  }
  if (/<!DOCTYPE/i.test(xml)) {
    throw new Error('DTD não permitido.');
  }
  if (!/<nfeProc(?:\s|>)/i.test(xml)) {
    throw new Error('XML não contém nfeProc.');
  }
  if (!xml.includes(`Id="NFe${accessKey}"`) && !xml.includes(`Id='NFe${accessKey}'`)) {
    throw new Error('XML não corresponde à chave consultada.');
  }
  return xml;
}

function stringField(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} inválido.`);
  }
  return value.trim();
}
