import { normalizeTaxId } from './supplier-store';
import { ACCESS_KEY_PATTERN } from './shared/access-key.js';
import { MAX_XML_BYTES } from './shared/constants.js';
export const PORTAL_ORIGIN = 'https://www.nfe.fazenda.gov.br';
export { ACCESS_KEY_PATTERN, MAX_XML_BYTES };
export function parseAppCommand(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Comando inválido.');
    }
    const input = value;
    const type = stringField(input, 'type');
    const requestId = stringField(input, 'requestId');
    if (type === 'ping' || type === 'open_options') {
        return { type, requestId };
    }
    if (type === 'start') {
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
        if (!taxId)
            throw new Error('Identificador fiscal inválido.');
        return { type, requestId, taxId };
    }
    throw new Error('Comando desconhecido.');
}
export function isTerminalPortalState(value) {
    return value === 'completed' || value === 'failed' || value === 'cancelled';
}
export function validateXmlPayload(xml, accessKey) {
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
function stringField(input, field) {
    const value = input[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${field} inválido.`);
    }
    return value.trim();
}