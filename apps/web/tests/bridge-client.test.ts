import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_BASE_URL } from '../src/bridge/contracts';
import { BridgeClient } from '../src/bridge/client';

describe('BridgeClient', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads health only from the fixed bridge endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        version: '2.0.0',
        status: 'ok',
        webView2Available: true,
        certificateSelected: false,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const health = await new BridgeClient().health();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BRIDGE_BASE_URL}/health`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
      }),
    );
    expect(health.status).toBe('ok');
    expect(health.version).toBe('2.0.0');
  });

  it('rejects malformed health payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(new BridgeClient().health()).rejects.toThrow('Resposta inválida do Bridge');
  });

  it('lists certificates using only the local versioned endpoint', async () => {
    const payload = {
      certificates: [{
        subject: 'CN=Empresa Teste',
        issuer: 'CN=Autoridade Teste',
        notBefore: '2026-09-01T00:00:00Z',
        notAfter: '2027-09-01T00:00:00Z',
        thumbprint: 'ABC123',
      }],
      selectedThumbprint: 'ABC123',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await new BridgeClient().listCertificates();

    expect(fetchMock).toHaveBeenCalledWith(
      `${BRIDGE_BASE_URL}/certificates`,
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    );
    expect(result).toEqual(payload);
  });

  it('rejects certificate payloads with unexpected secret-bearing fields', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        certificates: [{
          subject: 'CN=Empresa Teste',
          issuer: 'CN=Autoridade Teste',
          notBefore: '2026-09-01T00:00:00Z',
          notAfter: '2027-09-01T00:00:00Z',
          thumbprint: 'ABC123',
          privateKey: 'never',
        }],
        selectedThumbprint: null,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(new BridgeClient().listCertificates()).rejects.toThrow('Resposta inválida de certificados');
  });

  it('selects a certificate by thumbprint only', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await new BridgeClient().selectCertificate('ABC123');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BRIDGE_BASE_URL}/certificate/select`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ thumbprint: 'ABC123' }),
      }),
    );
  });

  it('looks up NFe only through the fixed local bridge endpoint', async () => {
    const payload = {
      category: 'fiscal_status',
      xml: null,
      cStat: '137',
      message: 'Nenhum documento localizado',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await new BridgeClient().lookupNfe('35260812345678000195550010000000011000000018');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BRIDGE_BASE_URL}/nfe/lookup`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ accessKey: '35260812345678000195550010000000011000000018' }),
      }),
    );
    expect(result).toEqual(payload);
  });

  it('rejects malformed lookup payloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        category: 'success',
        xml: '<nfeProc/>',
        cStat: '138',
        message: 'Documento localizado',
        privateKey: 'never',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      new BridgeClient().lookupNfe('35260812345678000195550010000000011000000018'),
    ).rejects.toThrow('Resposta inválida da consulta NF-e');
  });

  it('uses a short timeout for health', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new BridgeClient(BRIDGE_BASE_URL, {
      healthMs: 20,
      localMs: 100,
      lookupMs: 500,
      portalMs: 100,
    });

    const promise = client.health();
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
  });

  it('keeps lookup alive past the health timeout and aborts only at lookup timeout', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new BridgeClient(BRIDGE_BASE_URL, {
      healthMs: 20,
      localMs: 100,
      lookupMs: 500,
      portalMs: 100,
    });

    const promise = client.lookupNfe('35260812345678000195550010000000011000000018');
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(20);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(480);
    await rejected;
    expect(aborted).toBe(true);
  });

  it('portal calls do not inherit the short health timeout', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new BridgeClient(BRIDGE_BASE_URL, {
      healthMs: 20,
      localMs: 100,
      lookupMs: 500,
      portalMs: 100,
    });

    const promise = client.startPortal('35260812345678000195550010000000011000000018');
    const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(20);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(80);
    await rejected;
    expect(aborted).toBe(true);
  });
});
