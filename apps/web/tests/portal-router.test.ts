import { describe, expect, it } from 'vitest';

const KEY = '42260912345678000195550010000000011123456786';

function completed(operationId: string) {
  return { operationId, state: 'completed' as const, message: null, xml: '<nfeProc />' };
}

describe('PortalRouter', () => {
  it('prefers the extension when it is ready', async () => {
    const { PortalRouter } = await import('../src/portal/router');
    let bridgeStarts = 0;
    const router = new PortalRouter(
      {
        isAvailable: async () => true,
        start: async () => 'ext-1',
        waitForResult: async (id: string) => completed(id),
        cancel: async () => {},
      },
      {
        prewarm: async () => {},
        start: async () => { bridgeStarts += 1; return 'bridge-1'; },
        waitForResult: async (id: string) => completed(id),
        cancel: async () => {},
      },
    );

    const id = await router.start(KEY);
    expect(id).toBe('ext-1');
    expect(bridgeStarts).toBe(0);
    expect(await router.waitForResult(id)).toEqual(completed('ext-1'));
  });

  it('does not open the Bridge when extension start returns an error', async () => {
    const { PortalRouter } = await import('../src/portal/router');
    let bridgeStarts = 0;
    const router = new PortalRouter(
      {
        isAvailable: async () => true,
        start: async () => Promise.reject(new Error('start failed')),
        waitForResult: async (id: string) => completed(id),
        cancel: async () => {},
      },
      {
        prewarm: async () => {},
        start: async () => { bridgeStarts += 1; return 'bridge-4'; },
        waitForResult: async (id: string) => completed(id),
        cancel: async () => {},
      },
    );

    await expect(router.start(KEY)).rejects.toThrow('start failed');
    expect(bridgeStarts).toBe(0);
  });

  it('falls back to the Bridge only when the extension is unavailable before start', async () => {
    const { PortalRouter } = await import('../src/portal/router');
    let bridgeStarts = 0;
    const router = new PortalRouter(
      {
        isAvailable: async () => false,
        start: async () => { throw new Error('must not start'); },
        waitForResult: async (id: string) => completed(id),
        cancel: async () => {},
      },
      {
        prewarm: async () => {},
        start: async () => { bridgeStarts += 1; return 'bridge-1'; },
        waitForResult: async (id: string) => completed(id),
        cancel: async () => {},
      },
    );

    expect(await router.start(KEY)).toBe('bridge-1');
    expect(bridgeStarts).toBe(1);
  });

  it('does not open the Bridge automatically after an extension operation has started', async () => {
    const { PortalRouter } = await import('../src/portal/router');
    let bridgeStarts = 0;
    const router = new PortalRouter(
      {
        isAvailable: async () => true,
        start: async () => 'ext-2',
        waitForResult: async (id: string) => ({
          operationId: id,
          state: 'failed' as const,
          message: 'capture failed',
          xml: null,
        }),
        cancel: async () => {},
      },
      {
        prewarm: async () => {},
        start: async () => { bridgeStarts += 1; return 'bridge-2'; },
        waitForResult: async (id: string) => completed(id),
        cancel: async () => {},
      },
    );

    const id = await router.start(KEY);
    const result = await router.waitForResult(id);
    expect(result.state).toBe('failed');
    expect(bridgeStarts).toBe(0);
  });

  it('routes cancellation to the backend that owns the operation', async () => {
    const { PortalRouter } = await import('../src/portal/router');
    const cancelled: string[] = [];
    const router = new PortalRouter(
      {
        isAvailable: async () => true,
        start: async () => 'ext-3',
        waitForResult: async (id: string) => completed(id),
        cancel: async (id: string) => { cancelled.push('extension:' + id); },
      },
      {
        prewarm: async () => {},
        start: async () => 'bridge-3',
        waitForResult: async (id: string) => completed(id),
        cancel: async (id: string) => { cancelled.push('bridge:' + id); },
      },
    );

    const id = await router.start(KEY);
    await router.cancel(id);
    expect(cancelled).toEqual(['extension:ext-3']);
  });
  it('keeps ownership after an aborted wait so cancellation reaches the active extension popup', async () => {
    const { PortalRouter } = await import('../src/portal/router');
    const cancelled: string[] = [];
    const router = new PortalRouter(
      {
        isAvailable: async () => true,
        start: async () => 'ext-abort',
        waitForResult: async (_id: string, signal?: AbortSignal) => new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
        cancel: async (id: string) => { cancelled.push('extension:' + id); },
      },
      {
        prewarm: async () => {},
        start: async () => 'bridge-abort',
        waitForResult: async (id: string) => completed(id),
        cancel: async (id: string) => { cancelled.push('bridge:' + id); },
      },
    );

    const id = await router.start(KEY);
    const controller = new AbortController();
    const waiting = router.waitForResult(id, controller.signal);
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await router.cancel(id);

    expect(cancelled).toEqual(['extension:ext-abort']);
  });

});
