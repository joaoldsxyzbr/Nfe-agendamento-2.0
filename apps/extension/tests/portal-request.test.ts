import { describe, expect, it } from 'vitest';

const KEY = '42260912345678000195550010000000011123456786';

describe('Portal XML request capture', () => {
  it('accepts only the official download endpoint and ignores extension-initiated requests', async () => {
    const { shouldCapturePortalRequest } = await import('../src/portal-request');

    expect(shouldCapturePortalRequest({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      method: 'GET',
      initiator: 'https://www.nfe.fazenda.gov.br',
    })).toBe(true);

    expect(shouldCapturePortalRequest({
      url: 'https://example.com/portal/downloadNFe.aspx',
      method: 'GET',
      initiator: 'https://www.nfe.fazenda.gov.br',
    })).toBe(false);

    expect(shouldCapturePortalRequest({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      method: 'GET',
      initiator: 'chrome-extension://abcdefghijklmnop',
    })).toBe(false);
  });

  it('rebuilds GET/form POST without accepting arbitrary methods or bodies', async () => {
    const { buildReplayRequest, buildPageReplayRequest } = await import('../src/portal-request');

    expect(buildReplayRequest({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      method: 'GET',
    })).toEqual({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      init: { method: 'GET', credentials: 'include', redirect: 'follow' },
    });

    const post = buildReplayRequest({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      method: 'POST',
      requestBody: { formData: { chave: [KEY], acao: ['download'] } },
    });
    expect(post.init.method).toBe('POST');
    expect(String(post.init.body)).toContain('chave=');

    const pageReplay = buildPageReplayRequest({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      method: 'POST',
      requestBody: { formData: { chave: [KEY], acao: ['download'] } },
    });
    expect(pageReplay).toEqual({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: {
        encoding: 'text',
        value: expect.stringContaining('chave='),
      },
    });
    expect(() => buildReplayRequest({
      url: 'https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx',
      method: 'PUT',
    })).toThrow();
  });
});
