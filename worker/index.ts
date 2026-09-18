import { DurableObject } from 'cloudflare:workers';
import { blockFiscalUsage, reserveFiscalUsage } from './fiscal-coordinator-core';
import { handleFiscalCoordinationRequest } from './fiscal-coordination-http';
import { handleUpdateRequest } from './update-proxy';

const STATE_KEY = 'fiscal-usage-v1';

export class FiscalCoordinator extends DurableObject {
  reserve() {
    return this.ctx.storage.transactionSync(() => {
      const transition = reserveFiscalUsage(this.ctx.storage.kv.get(STATE_KEY), Date.now());
      this.ctx.storage.kv.put(STATE_KEY, transition.state);
      return transition.decision;
    });
  }

  block() {
    return this.ctx.storage.transactionSync(() => {
      const transition = blockFiscalUsage(this.ctx.storage.kv.get(STATE_KEY), Date.now());
      this.ctx.storage.kv.put(STATE_KEY, transition.state);
      return transition.decision;
    });
  }
}

export default {
  async fetch(request, env) {
    const edgeCache = (caches as unknown as { default: Cache }).default;
    const updateResponse = await handleUpdateRequest(request, {
      fetchUpstream: (upstreamRequest) => fetch(upstreamRequest),
      rateLimit: (key) => env.UPDATE_RATE_LIMITER.limit({ key }),
      cacheMatch: async (cacheRequest) => (await edgeCache.match(cacheRequest)) ?? undefined,
      cachePut: (cacheRequest, response) => edgeCache.put(cacheRequest, response),
    });
    if (updateResponse !== null) return updateResponse;

    const coordinationResponse = await handleFiscalCoordinationRequest(request, {
      rateLimit: (key) => env.COORDINATION_RATE_LIMITER.limit({ key }),
      executeFiscal: async (operation, namespace) => {
        const stub = env.FISCAL_COORDINATOR.getByName(namespace);
        return operation === 'reserve' ? stub.reserve() : stub.block();
      },
    });

    return coordinationResponse ?? env.ASSETS.fetch(request);
  },
};
