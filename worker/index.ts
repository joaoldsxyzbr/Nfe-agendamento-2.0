import { DurableObject } from 'cloudflare:workers';
import { blockFiscalUsage, reserveFiscalUsage } from './fiscal-coordinator-core';
import {
  COORDINATION_RATE_LIMIT_KEY,
  handleFiscalCoordinationRequest,
} from './fiscal-coordination-http';

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
    const coordinationResponse = await handleFiscalCoordinationRequest(request, {
      rateLimit: () => env.COORDINATION_RATE_LIMITER.limit({
        key: COORDINATION_RATE_LIMIT_KEY,
      }),
      executeFiscal: async (operation, namespace) => {
        const stub = env.FISCAL_COORDINATOR.getByName(namespace);
        return operation === 'reserve' ? stub.reserve() : stub.block();
      },
    });

    return coordinationResponse ?? env.ASSETS.fetch(request);
  },
};
