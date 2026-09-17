# Fiscal Coordinator Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger os endpoints públicos de coordenação fiscal contra abuso HTTP antes de qualquer acesso ao Durable Object fiscal, mantendo intacto o limite fiscal exato existente.

**Architecture:** Usar o Rate Limiting binding nativo do Cloudflare Workers como gate global de 300 requisições/60s por localização Cloudflare. Extrair a política HTTP para um módulo puro e testável, deixando `worker/index.ts` apenas como integração dos bindings reais. Falha do rate limiter é fail-safe (`503`) e negação retorna `429` sem tocar no `FiscalCoordinator`.

**Tech Stack:** TypeScript 7, Vitest 5, Cloudflare Workers, Wrangler 4.129.1, Durable Objects SQLite existentes.

**Spec:** `docs/superpowers/specs/2026-09-16-fiscal-coordinator-rate-limit-design.md`

## Global Constraints

- Não alterar o comportamento de `FiscalCoordinator.reserve()` ou `FiscalCoordinator.block()`.
- Não adicionar dependências npm.
- Não enviar/persistir CNPJ, chave NF-e, XML, PFX, senha ou chave privada.
- `COORDINATION_RATE_LIMITER` deve rodar antes de qualquer `FISCAL_COORDINATOR.getByName(...)`.
- Rate limiting HTTP é proteção contra abuso, não contabilidade fiscal.
- Em erro do rate limiter, falhar fechado com `503`.
- Manter documentação do GitHub sincronizada com o código.

---

### Task 1: Criar os testes RED do gate HTTP

**Files:**
- Create: `apps/web/tests/fiscal-coordinator-worker.test.ts`
- Modify: `apps/web/tests/deploy-config.test.ts`

**Interfaces:**
- Consumes: nenhuma interface nova existente.
- Produces: contrato esperado para `handleFiscalCoordinationRequest(request, dependencies)` e para o binding `COORDINATION_RATE_LIMITER`.

- [ ] **Step 1: Criar teste do handler antes da implementação**

Criar `apps/web/tests/fiscal-coordinator-worker.test.ts` com os cenários abaixo. As dependências são closures simples para observar se rate limiter e operação fiscal foram chamados; nenhuma biblioteca de mocks deve ser adicionada.

```ts
import { describe, expect, it } from 'vitest';
import { handleFiscalCoordinationRequest } from '../../../worker/fiscal-coordination-http';

const validToken = 'A'.repeat(43);
const auth = { Authorization: `Bearer ${validToken}` };
const allowedDecision = {
  allowDirectLookup: true,
  blockedUntilUtc: null,
  reason: null,
};

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://nfeagendamento.joaolds.xyz.br${path}`, {
    method: 'POST',
    headers: auth,
    ...init,
  });
}

describe('fiscal coordination worker HTTP gate', () => {
  it('returns 405 before rate limiting for non-POST requests', async () => {
    let rateCalls = 0;
    let fiscalCalls = 0;
    const response = await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve', { method: 'GET' }),
      {
        rateLimit: async () => { rateCalls += 1; return { success: true }; },
        executeFiscal: async () => { fiscalCalls += 1; return allowedDecision; },
      },
    );

    expect(response?.status).toBe(405);
    expect(response?.headers.get('Allow')).toBe('POST');
    expect(rateCalls).toBe(0);
    expect(fiscalCalls).toBe(0);
  });

  it('returns 401 for an invalid bearer without calling protected resources', async () => {
    let rateCalls = 0;
    let fiscalCalls = 0;
    const response = await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve', {
        headers: { Authorization: 'Bearer invalid' },
      }),
      {
        rateLimit: async () => { rateCalls += 1; return { success: true }; },
        executeFiscal: async () => { fiscalCalls += 1; return allowedDecision; },
      },
    );

    expect(response?.status).toBe(401);
    expect(rateCalls).toBe(0);
    expect(fiscalCalls).toBe(0);
  });

  it('returns 404 for an unknown coordination route before rate limiting', async () => {
    let rateCalls = 0;
    let fiscalCalls = 0;
    const response = await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/unknown'),
      {
        rateLimit: async () => { rateCalls += 1; return { success: true }; },
        executeFiscal: async () => { fiscalCalls += 1; return allowedDecision; },
      },
    );

    expect(response?.status).toBe(404);
    expect(rateCalls).toBe(0);
    expect(fiscalCalls).toBe(0);
  });

  it('returns 429 with Retry-After when the Cloudflare limiter denies the request', async () => {
    let fiscalCalls = 0;
    const response = await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve'),
      {
        rateLimit: async () => ({ success: false }),
        executeFiscal: async () => { fiscalCalls += 1; return allowedDecision; },
      },
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get('Retry-After')).toBe('60');
    await expect(response?.json()).resolves.toEqual({
      error: 'rate_limited',
      retryAfterSeconds: 60,
    });
    expect(fiscalCalls).toBe(0);
  });

  it('fails closed with 503 when the limiter is unavailable', async () => {
    let fiscalCalls = 0;
    const response = await handleFiscalCoordinationRequest(
      request('/api/fiscal-coordination/reserve'),
      {
        rateLimit: async () => { throw new Error('limiter unavailable'); },
        executeFiscal: async () => { fiscalCalls += 1; return allowedDecision; },
      },
    );

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ error: 'rate_limiter_unavailable' });
    expect(fiscalCalls).toBe(0);
  });

  it.each([
    ['/api/fiscal-coordination/reserve', 'reserve'],
    ['/api/fiscal-coordination/block', 'block'],
  ] as const)('dispatches %s to the matching fiscal operation after the gate', async (path, expectedOperation) => {
    const operations: string[] = [];
    const response = await handleFiscalCoordinationRequest(request(path), {
      rateLimit: async () => ({ success: true }),
      executeFiscal: async (operation, namespace) => {
        operations.push(`${operation}:${namespace.length}`);
        return allowedDecision;
      },
    });

    expect(response?.status).toBe(200);
    expect(operations).toEqual([`${expectedOperation}:64`]);
  });

  it('returns null for non-coordination routes so index.ts can delegate to assets', async () => {
    const response = await handleFiscalCoordinationRequest(
      request('/'),
      {
        rateLimit: async () => ({ success: true }),
        executeFiscal: async () => allowedDecision,
      },
    );

    expect(response).toBeNull();
  });
});
```

- [ ] **Step 2: Fixar o contrato do `wrangler.jsonc` no teste de deploy**

Em `apps/web/tests/deploy-config.test.ts`, adicionar leitura de `ratelimits` e um teste equivalente a:

```ts
it('rate limits fiscal coordination before durable-object usage', async () => {
  const raw = await readFile(rootWranglerUrl, 'utf8');
  const config = JSON.parse(raw) as {
    ratelimits?: Array<{
      name?: string;
      namespace_id?: string;
      simple?: { limit?: number; period?: number };
    }>;
  };

  expect(config.ratelimits).toContainEqual({
    name: 'COORDINATION_RATE_LIMITER',
    namespace_id: '1361318030',
    simple: { limit: 300, period: 60 },
  });
});
```

- [ ] **Step 3: Confirmar RED no GitHub Actions**

Commitar apenas os testes e aguardar o job `web` do PR.

Expected: `web` deve falhar porque `worker/fiscal-coordination-http.ts` ainda não existe e/ou porque o binding ainda não está em `wrangler.jsonc`. Os demais jobs podem continuar verdes.

---

### Task 2: Implementar o gate mínimo e integrar o Worker

**Files:**
- Create: `worker/fiscal-coordination-http.ts`
- Modify: `worker/index.ts`
- Modify: `wrangler.jsonc`

**Interfaces:**
- Consumes: `FiscalCoordinationDecision` de `worker/fiscal-coordinator-core.ts`.
- Produces: `handleFiscalCoordinationRequest(request, dependencies): Promise<Response | null>`.

- [ ] **Step 1: Criar o handler mínimo para satisfazer os testes**

Criar `worker/fiscal-coordination-http.ts` com estas constantes e contratos:

```ts
import type { FiscalCoordinationDecision } from './fiscal-coordinator-core';

export const COORDINATION_RATE_LIMIT_KEY = 'fiscal-coordination';
export const COORDINATION_RATE_LIMIT_PERIOD_SECONDS = 60;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type FiscalOperation = 'reserve' | 'block';

type Dependencies = Readonly<{
  rateLimit: () => Promise<{ success: boolean }>;
  executeFiscal: (
    operation: FiscalOperation,
    namespace: string,
  ) => Promise<FiscalCoordinationDecision>;
}>;
```

O handler deve:

1. retornar `null` se a rota não começar por `/api/fiscal-coordination/`;
2. retornar `405` para método diferente de POST;
3. validar bearer de 43 caracteres Base64URL e retornar `401` quando inválido;
4. reconhecer somente `/reserve` e `/block`, retornando `404` antes do rate limiter em qualquer outra rota;
5. executar `dependencies.rateLimit()` dentro de `try/catch`;
6. retornar `503 { error: 'rate_limiter_unavailable' }` em exceção ou resultado sem booleano `success`;
7. retornar `429 { error: 'rate_limited', retryAfterSeconds: 60 }` com `Retry-After: 60` se `success === false`;
8. somente depois calcular `SHA-256(token)` e chamar `executeFiscal(operation, namespace)`;
9. devolver a decisão fiscal no mesmo formato JSON usado atualmente.

Todos os JSON devem continuar com `Content-Type: application/json; charset=utf-8` e `Cache-Control: no-store`.

- [ ] **Step 2: Integrar o handler em `worker/index.ts`**

Manter `FiscalCoordinator` sem mudanças comportamentais. Substituir apenas o roteamento HTTP atual por:

```ts
import { COORDINATION_RATE_LIMIT_KEY, handleFiscalCoordinationRequest } from './fiscal-coordination-http';

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
```

Não duplicar validação de token/rota em `index.ts`.

- [ ] **Step 3: Configurar o binding nativo em `wrangler.jsonc`**

Adicionar na raiz:

```json
"ratelimits": [
  {
    "name": "COORDINATION_RATE_LIMITER",
    "namespace_id": "1361318030",
    "simple": {
      "limit": 300,
      "period": 60
    }
  }
]
```

Não adicionar migrations nem novo Durable Object.

- [ ] **Step 4: Confirmar GREEN no GitHub Actions**

Aguardar o job `web` do PR.

Expected: lint, format-check, Vitest, build e `wrangler deploy --dry-run` passam. Se `wrangler deploy --dry-run` rejeitar o binding, corrigir a configuração antes de seguir; não remover o teste para mascarar a falha.

---

### Task 3: Atualizar documentação operacional

**Files:**
- Modify: `docs/architecture/fiscal-usage-guard.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-17-fiscal-coordinator-rate-limit.md`

**Interfaces:**
- Consumes: comportamento implementado e validado no Task 2.
- Produces: documentação consistente com o runtime real.

- [ ] **Step 1: Documentar as duas camadas de limite**

Em `docs/architecture/fiscal-usage-guard.md`, registrar explicitamente:

```text
Camada HTTP: COORDINATION_RATE_LIMITER, 300 req/60s por localização Cloudflare,
proteção best-effort contra abuso e anterior ao Durable Object fiscal.

Camada fiscal: FiscalCoordinator/FiscalUsageGuard, 20 tentativas/hora por identidade A1,
transacional e fail-safe. Esta é a única camada usada para contabilidade fiscal.
```

Também documentar que a API nativa da Cloudflare é local por localização e eventualmente consistente, portanto não substitui o gate fiscal.

- [ ] **Step 2: Atualizar a seção Segurança do README**

Adicionar um bullet curto informando que `/api/fiscal-coordination/*` passa por rate limiting Cloudflare antes do Durable Object fiscal, sem adicionar dados fiscais ao Worker.

- [ ] **Step 3: Marcar este plano como executado somente depois das verificações**

Converter os checkboxes concluídos para `[x]` apenas após os respectivos resultados existirem no GitHub Actions.

---

### Task 4: Verificação completa do pacote de hardening

**Files:**
- No production changes expected.

**Interfaces:**
- Consumes: branch completa.
- Produces: evidência de conclusão.

- [ ] **Step 1: Confirmar CI completo do último SHA**

Verificar no PR que os jobs abaixo terminaram com sucesso no mesmo commit:

```text
web
danfe-print
bridge
fiscal-compatibility
windows-package
```

- [ ] **Step 2: Confirmar CodeQL do último SHA quando disponível**

Se CodeQL não rodar para o evento do PR, registrar isso sem declarar validação inexistente. Se rodar, exigir resultado verde.

- [ ] **Step 3: Revisar o diff final**

Confirmar que o pacote não alterou Bridge, Portal, DANFE, `FiscalCoordinator` core nem limite fiscal de 20/h.

- [ ] **Step 4: Atualizar o PR com o resultado real**

Registrar no corpo/comentário do PR quais verificações passaram e quaisquer validações externas ainda pendentes. Não declarar deploy em produção nem validação física sem evidência.
