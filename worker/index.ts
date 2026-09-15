import { DurableObject } from 'cloudflare:workers';
import { blockFiscalUsage, reserveFiscalUsage } from './fiscal-coordinator-core';

const STATE_KEY = 'fiscal-usage-v1';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

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
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/fiscal-coordination/')) {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    }

    const token = bearerToken(request.headers.get('Authorization'));
    if (!token) {
      return json({ error: 'unauthorized' }, 401);
    }

    const namespace = await sha256Hex(token);
    const stub = env.FISCAL_COORDINATOR.getByName(namespace);

    if (url.pathname === '/api/fiscal-coordination/reserve') {
      const decision = await stub.reserve();
      return decisionResponse(decision);
    }

    if (url.pathname === '/api/fiscal-coordination/block') {
      const decision = await stub.block();
      return decisionResponse(decision);
    }

    return json({ error: 'not_found' }, 404);
  },
};

function bearerToken(value) {
  if (!value?.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decisionResponse(decision) {
  return json({
    allowDirectLookup: decision.allowDirectLookup,
    blockedUntilUtc: decision.blockedUntilUtc === null
      ? null
      : new Date(decision.blockedUntilUtc).toISOString(),
    reason: decision.reason,
  });
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}
