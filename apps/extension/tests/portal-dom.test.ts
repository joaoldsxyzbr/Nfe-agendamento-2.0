import { describe, expect, it } from 'vitest';

describe('Portal DOM policy', () => {
  it('recognizes only the official NF-e consultation and download paths', async () => {
    const { isOfficialConsultUrl, isOfficialDownloadUrl } = await import('../src/portal-dom');

    expect(isOfficialConsultUrl('https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo')).toBe(true);
    expect(isOfficialConsultUrl('https://evil.example/portal/consultaRecaptcha.aspx')).toBe(false);

    expect(isOfficialDownloadUrl('https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx')).toBe(true);
    expect(isOfficialDownloadUrl('https://www.nfe.fazenda.gov.br/outro/downloadNFe.aspx')).toBe(false);
  });

  it('recognizes only expected official controls and a human captcha response', async () => {
    const {
      isDownloadLabel,
      isCaptchaResponseReady,
      isLikelyHtmlDocument,
      accessKeySelector,
      consultButtonSelector,
    } = await import('../src/portal-dom');

    expect(accessKeySelector).toContain('txtChaveAcessoResumo');
    expect(consultButtonSelector).toContain('btnConsultarHCaptcha');
    expect(isDownloadLabel('Download do Documento')).toBe(true);
    expect(isDownloadLabel('  DOWNLOAD DO DOCUMENTO XML ')).toBe(true);
    expect(isDownloadLabel('Baixar qualquer arquivo')).toBe(false);
    expect(isCaptchaResponseReady('')).toBe(false);
    expect(isCaptchaResponseReady('token-preenchido-pelo-hcaptcha')).toBe(true);
    expect(isLikelyHtmlDocument('<!doctype html><html><body>sessão expirada</body></html>')).toBe(true);
    expect(isLikelyHtmlDocument('<?xml version="1.0"?><html><body>login</body></html>')).toBe(true);
    expect(isLikelyHtmlDocument('<?xml version="1.0"?><nfeProc><NFe/></nfeProc>')).toBe(false);
  });
});
