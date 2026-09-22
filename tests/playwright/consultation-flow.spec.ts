import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
const ACCESS_KEY = '42260812345678000123550010000012341000012342';
const xml = await readFile(new URL('../../apps/web/tests/fixtures/nfe-basic.xml', import.meta.url), 'utf8');

test('consulta unitária preserva o card usando somente a extensão', async ({ page }) => {
  await page.addInitScript(({ xmlPayload }) => {
    const channel = 'nfe-agendamento:portal-extension';
    let operationId = '';
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const envelope = event.data as any;
      if (!envelope || envelope.channel !== channel || envelope.direction !== 'request') return;
      const command = envelope.command;
      const respond = (response: unknown) => window.postMessage({ channel, direction: 'response', requestId: envelope.requestId, response }, window.location.origin);
      if (command?.type === 'ping') { respond({ type: 'ready', requestId: command.requestId, version: '0.2.4', capabilities: { portalLookup: true, supplierResolution: true } }); return; }
      if (command?.type === 'start') {
        operationId = 'e2e-op';
        respond({ type: 'started', requestId: command.requestId, operationId });
        window.setTimeout(() => window.postMessage({ channel, direction: 'event', event: { type: 'completed', operationId, xml: xmlPayload } }, window.location.origin), 300);
        return;
      }
      if (command?.type === 'status') { respond({ type: 'operation_status', requestId: command.requestId, operationId, active: true, state: 'waiting_user' }); return; }
      if (command?.type === 'resolve_supplier') { respond({ type: 'supplier_resolved', requestId: command.requestId, supplierId: null }); return; }
      if (command?.type === 'cancel') respond({ type: 'cancelled', requestId: command.requestId, operationId });
    });
  }, { xmlPayload: xml });

  await page.goto('/');
  await expect(page.locator('#integration-status-text')).toContainText('Extensão conectada');
  const input = page.locator('#batch-keys');
  const consult = page.locator('#batch-start');
  const cancel = page.locator('#batch-cancel');
  await input.fill(ACCESS_KEY);
  await expect(consult).toBeEnabled();
  await consult.click();
  await expect(page.locator('#batch-route')).toContainText('Portal');
  await expect(cancel).toBeVisible();
  const row = page.locator('.batch-item[data-state="success"]');
  await expect(row).toBeVisible();
  await expect(cancel).toBeHidden();
  await expect(row.getByRole('button', { name: 'Visualizar DANFE' })).toBeEnabled();
  await expect(row.getByRole('button', { name: 'Baixar XML' })).toBeEnabled();
  const reset = page.locator('#batch-reset');
  await expect(reset).toBeVisible();
  await reset.click();
  await expect(input).toHaveValue('');
});
