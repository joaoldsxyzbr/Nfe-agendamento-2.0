import { readFile } from 'node:fs/promises';
import { expect, test, type Route } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';
const BRIDGE = 'http://127.0.0.1:17345/api/v1';
const ACCESS_KEY = '42260812345678000123550010000012341000012342';
const xml = await readFile(
  new URL('../../apps/web/tests/fixtures/nfe-basic.xml', import.meta.url),
  'utf8',
);

test('consulta unitária preserva o card e alterna apenas os estados necessários', async ({ page }) => {
  let releaseLookup: (() => void) | null = null;
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });

  await page.route(`${BRIDGE}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders() });
      return;
    }

    if (url.pathname.endsWith('/health')) {
      await fulfillJson(route, {
        version: '0.0.16',
        status: 'ok',
        webView2Available: true,
        certificateSelected: true,
      });
      return;
    }

    if (url.pathname.endsWith('/certificates')) {
      await fulfillJson(route, {
        certificates: [{
          subject: 'CN=Teste',
          issuer: 'CN=Teste',
          notBefore: '2026-01-01T00:00:00Z',
          notAfter: '2027-01-01T00:00:00Z',
          thumbprint: 'ABC123',
        }],
        selectedThumbprint: 'ABC123',
      });
      return;
    }

    if (url.pathname.endsWith('/nfe/lookup')) {
      await lookupGate;
      await fulfillJson(route, {
        category: 'success',
        xml,
        cStat: '138',
        message: null,
      });
      return;
    }

    if (url.pathname.endsWith('/supplier/resolve')) {
      await fulfillJson(route, { supplierId: null });
      return;
    }

    await fulfillJson(route, {});
  });

  await page.goto('/');
  await expect(page.locator('#bridge-status-text')).toHaveText('Bridge conectado');

  const input = page.locator('#batch-keys');
  const consult = page.locator('#batch-start');
  const cancel = page.locator('#batch-cancel');
  const toolbar = page.locator('#batch-run-toolbar');

  await input.fill(ACCESS_KEY);
  await expect(consult).toBeEnabled();
  await expect(cancel).toBeHidden();

  await consult.click();
  await expect(page.locator('#batch-route')).toContainText('Consultando SEFAZ');
  await expect(toolbar).toBeVisible();
  await expect(cancel).toBeVisible();

  releaseLookup?.();

  const row = page.locator('.batch-item[data-state="success"]');
  await expect(row).toBeVisible();
  await expect(toolbar).toBeVisible();
  await expect(cancel).toBeHidden();
  await expect(row.locator('.batch-order')).toBeVisible();
  await expect(row.locator('.batch-key')).toBeVisible();
  await expect(row.locator('.batch-status')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Visualizar DANFE' })).toBeEnabled();
  await expect(row.getByRole('button', { name: 'Baixar XML' })).toBeEnabled();

  const reset = page.locator('#batch-reset');
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(input).toHaveValue('');
  await expect(consult).toBeVisible();
});

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: corsHeaders(),
    body: JSON.stringify(body),
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
    'Access-Control-Allow-Private-Network': 'true',
  };
}
