import { PORTAL_ORIGIN } from './protocol';

export const accessKeySelector =
  '#ctl00_ContentPlaceHolder1_txtChaveAcessoResumo, input[id$="txtChaveAcessoResumo"]';
export const consultButtonSelector =
  '#ctl00_ContentPlaceHolder1_btnConsultarHCaptcha, #ctl00_ContentPlaceHolder1_btnConsultar';

export function isOfficialConsultUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === PORTAL_ORIGIN &&
      url.pathname.toLowerCase() === '/portal/consultarecaptcha.aspx';
  } catch {
    return false;
  }
}

export function isOfficialDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === PORTAL_ORIGIN &&
      url.pathname.toLowerCase() === '/portal/downloadnfe.aspx';
  } catch {
    return false;
  }
}

export function isDownloadLabel(value: unknown): boolean {
  return normalize(value).startsWith('download do documento');
}

export function isCaptchaResponseReady(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isLikelyHtmlDocument(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const prefix = value.trimStart().slice(0, 512).toLocaleLowerCase('pt-BR');
  return prefix.startsWith('<!doctype html') ||
    prefix.startsWith('<html') ||
    /^<\?xml[^>]*\?>\s*<html(?:\s|>)/i.test(prefix);
}

function normalize(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}
