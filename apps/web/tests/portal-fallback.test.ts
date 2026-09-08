import { describe, expect, it } from 'vitest';
import { PortalFallbackController } from '../src/portal/fallback';
import type { PortalOperationStatus } from '../src/bridge/contracts';

const KEY = '42260812345678000123550010000012341000012342';

describe('PortalFallbackController', () => {
  it('starts one local portal operation and polls until XML is completed', async () => {
    const statuses: PortalOperationStatus[] = [
      { operationId: 'op1', state: 'waiting_for_user', message: 'captcha', xml: null },
      { operationId: 'op1', state: 'completed', message: 'ok', xml: '<nfeProc />' },
    ];
    const fake = {
      startPortal: async (accessKey: string) => {
        expect(accessKey).toBe(KEY);
        return { operationId: 'op1' };
      },
      getPortalStatus: async (operationId: string) => {
        expect(operationId).toBe('op1');
        return statuses.shift()!;
      },
    };
    const controller = new PortalFallbackController(fake, async () => {});

    const operationId = await controller.start(KEY);
    const result = await controller.waitForResult(operationId);

    expect(result.state).toBe('completed');
    expect(result.xml).toBe('<nfeProc />');
    expect(statuses).toHaveLength(0);
  });

  it('returns failed/cancelled terminal state without retrying forever', async () => {
    let calls = 0;
    const fake = {
      startPortal: async () => ({ operationId: 'op2' }),
      getPortalStatus: async () => {
        calls += 1;
        return { operationId: 'op2', state: 'cancelled' as const, message: 'fechado', xml: null };
      },
    };
    const controller = new PortalFallbackController(fake, async () => {});

    const result = await controller.waitForResult('op2');

    expect(result.state).toBe('cancelled');
    expect(calls).toBe(1);
  });

  it('stops polling when aborted', async () => {
    const abort = new AbortController();
    let calls = 0;
    const fake = {
      startPortal: async () => ({ operationId: 'op3' }),
      getPortalStatus: async () => {
        calls += 1;
        abort.abort();
        return { operationId: 'op3', state: 'waiting_for_user' as const, message: null, xml: null };
      },
    };
    const controller = new PortalFallbackController(fake, async () => {});

    await expect(controller.waitForResult('op3', abort.signal)).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
