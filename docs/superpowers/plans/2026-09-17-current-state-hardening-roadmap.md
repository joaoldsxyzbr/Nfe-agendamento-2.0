# NFe Agendamento 2.0 Current-State Hardening Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer o Worker, reduzir responsabilidades de `apps/web/src/main.ts`, fechar controles externos, registrar validação física e preparar a próxima release patch sem alterar a arquitetura funcional aprovada.

**Architecture:** A `main` atual é a fonte de verdade. O trabalho será dividido em PRs pequenos e sequenciais: primeiro o gate HTTP do Worker, depois extrações puramente estruturais do frontend, depois controles administrativos/assinatura/aceitação física e, por último, release. O PR #7 é somente referência; nenhum merge forçado ou reaproveitamento automático de sua branch é permitido.

**Tech Stack:** Cloudflare Workers + Durable Objects + Wrangler 4.129.1; TypeScript 7.0.2; Vite 8.2.2; Vitest 5.0.0; `@xmldom/xmldom` 0.9.12; .NET 10; WebView2; GitHub Actions; Playwright/Chromium isolado em `tests/playwright`; Inno Setup 6.7.1.

**Spec:** `docs/superpowers/specs/2026-09-17-current-state-hardening-roadmap-design.md`

## Global Constraints

- A `main` atual é a fonte de verdade; a base aprovada da spec é `b092a88b1df4e1a24f5309c78a27c60bc593b00d`, mas cada PR de implementação deve partir da `main` atualizada depois do merge anterior.
- Não reintroduzir Central, pareamento, LAN, mDNS ou pasta compartilhada.
- Não enviar CNPJ, chave NF-e, XML, PFX, senha ou chave privada ao Cloudflare.
- O limite fiscal exato continua no `FiscalUsageGuard` local e no `FiscalCoordinator` compartilhado; rate limiting HTTP é apenas proteção contra abuso/custo.
- Não alterar deliberadamente UX, DOM, fluxo fiscal, parsing XML ou DANFE durante a refatoração do frontend.
- Não adicionar biblioteca, framework ou state manager novo.
- Toda mudança de código usa characterization/TDD: RED comprovado, implementação mínima, GREEN, suíte completa.
- Atualizar documentação no mesmo PR da mudança que ela descreve.
- Não declarar ruleset, Authenticode ou aceitação física como concluídos sem evidência real.
- Não provocar `cStat 656` por repetição artificial de consultas.
- PR #7 é referência e só pode ser fechado depois que todo material útil tiver destino explícito.

---

## Mapa de arquivos e fronteiras

### Worker / coordenação fiscal

- Create `worker/fiscal-coordination-http.ts`: validação HTTP, gate de rate limit e despacho abstrato para `reserve`/`block`.
- Modify `worker/index.ts`: composição dos bindings Cloudflare reais e delegação para o handler.
- Modify `wrangler.jsonc`: binding `COORDINATION_RATE_LIMITER` com 300 requisições/60s.
- Create `apps/web/tests/fiscal-coordinator-worker.test.ts`: contratos 401/404/405/429/503 e despacho permitido.
- Modify `apps/web/tests/deploy-config.test.ts`: contrato estático do binding.
- Modify `docs/architecture/fiscal-usage-guard.md` e `README.md`: separar explicitamente proteção HTTP do teto fiscal.

### Frontend

- Create `apps/web/src/batch/controller.ts`: estado e ciclo do lote; recebe dependências, não importa estado global de `main.ts`.
- Create `apps/web/tests/batch-controller.test.ts`: characterization do lote.
- Create `apps/web/src/nfe/consultation-controller.ts`: fluxo de consulta individual e fallback elegível.
- Create `apps/web/tests/consultation-controller.test.ts`: characterization da consulta individual.
- Create `apps/web/src/bridge/certificate-controller.ts`: UI/coordenação de health, catálogo e seleção do A1.
- Create `apps/web/tests/certificate-controller.test.ts`: characterization do certificado/Bridge UI.
- Optional Create `apps/web/src/danfe/viewer.ts` + `apps/web/tests/danfe-viewer.test.ts`: somente se a revisão após as três extrações mostrar responsabilidade relevante de viewer ainda em `main.ts`.
- Modify `apps/web/src/main.ts`: composition root, markup existente e wiring entre controladores.
- Preserve `apps/web/src/danfe/render.ts`, paginação e CSS fiscal, salvo correção de regressão independente comprovada.

### Operação / distribuição

- Modify `docs/operations/repository-hardening.md`: registrar estado real do ruleset e Authenticode.
- Modify `docs/testing/acceptance.md`, `docs/testing/batch-query.md`, `docs/testing/danfe-layout.md`, `docs/testing/portal-post-hcaptcha.md`, `docs/testing/bridge-updater.md`: evidência física real.
- Modify `Directory.Build.props`: versão somente no PR final de release, se `0.0.14` ainda for a versão canônica.
- Create `docs/releases/v0.0.15.md`: somente se `0.0.15` continuar sendo a próxima patch correta.

---

### Task 1: Baseline e destino do PR #7

**Files:**
- Read: `.github/workflows/ci.yml`
- Read: `docs/superpowers/specs/2026-09-17-current-state-hardening-roadmap-design.md`
- Read: PR #7 diff
- Modify only if needed: PR #7 metadata/comment; no production file changes

**Interfaces:**
- Consumes: current `main` SHA and CI/CodeQL state.
- Produces: explicit inventory of PR #7 material to migrate: Worker HTTP gate/tests/config/docs, frontend design, repository/signing design.

- [ ] **Step 1: Resolve the current base SHA and verify the baseline**

Run through GitHub: fetch `main`, then fetch workflow runs/status for that exact SHA.

Expected: CI jobs `web`, `danfe-print`, `bridge`, `fiscal-compatibility`, `windows-package` and applicable CodeQL are green before implementation starts. If not green, stop and fix/understand baseline before this roadmap.

- [ ] **Step 2: Compare PR #7 against current `main`**

Review exactly these known PR #7 paths before reusing anything:

```text
worker/fiscal-coordination-http.ts
worker/index.ts
wrangler.jsonc
apps/web/tests/fiscal-coordinator-worker.test.ts
apps/web/tests/deploy-config.test.ts
docs/architecture/fiscal-usage-guard.md
README.md
docs/superpowers/specs/2026-09-16-fiscal-coordinator-rate-limit-design.md
docs/superpowers/specs/2026-09-16-web-main-refactor-design.md
docs/superpowers/specs/2026-09-16-repository-signing-controls-design.md
```

Expected: no code is copied blindly; current `main` wins on every conflict.

- [ ] **Step 3: Create the implementation branch from current `main`**

```bash
git switch main
git pull --ff-only
git switch -c hardening/fiscal-coordination-rate-limit
```

Expected: branch parent equals the freshly verified `main` SHA.

- [ ] **Step 4: Do not close PR #7 yet**

Expected: PR #7 remains open/reference until Tasks 2–8 have migrated or explicitly superseded all useful material.

---

### Task 2: Add the Worker HTTP rate-limit contract (RED)

**Files:**
- Create: `apps/web/tests/fiscal-coordinator-worker.test.ts`
- Modify: `apps/web/tests/deploy-config.test.ts`
- No production changes in this task

**Interfaces:**
- Consumes: future `handleFiscalCoordinationRequest(request, dependencies)`.
- Produces expected interface:

```ts
type FiscalOperation = 'reserve' | 'block';

type FiscalCoordinationDependencies = Readonly<{
  rateLimit: () => Promise<unknown>;
  executeFiscal: (
    operation: FiscalOperation,
    namespace: string,
  ) => Promise<FiscalCoordinationDecision>;
}>;

export function handleFiscalCoordinationRequest(
  request: Request,
  dependencies: FiscalCoordinationDependencies,
): Promise<Response | null>;
```

- [ ] **Step 1: Add the failing handler tests**

Create `apps/web/tests/fiscal-coordinator-worker.test.ts` with cases equivalent to:

```ts
import { describe, expect, it } from 'vitest';
import { handleFiscalCoordinationRequest } from '../../../worker/fiscal-coordination-http';

const validToken = 'A'.repeat(43);
const auth = { Authorization: `Bearer ${validToken}` };
const allowedDecision = { allowDirectLookup: true, blockedUntilUtc: null, reason: null };

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://nfeagendamento.joaolds.xyz.br${path}`, {
    method: 'POST', headers: auth, ...init,
  });
}

it('returns 429 without fiscal access when limiter denies', async () => {
  let fiscalCalls = 0;
  const response = await handleFiscalCoordinationRequest(
    request('/api/fiscal-coordination/reserve'),
    {
      rateLimit: async () => ({ success: false }),
      executeFiscal: async () => {
        fiscalCalls += 1;
        return allowedDecision;
      },
    },
  );
  expect(response?.status).toBe(429);
  expect(response?.headers.get('Retry-After')).toBe('60');
  expect(fiscalCalls).toBe(0);
});
```

Also add explicit tests for:

```text
GET known route -> 405, no limiter, no fiscal call
invalid bearer -> 401, no limiter, no fiscal call
unknown coordination route -> 404, no limiter, no fiscal call
limiter throws -> 503, no fiscal call
limiter returns malformed value -> 503, no fiscal call
reserve allowed -> executeFiscal('reserve', 64-char sha256 namespace)
block allowed -> executeFiscal('block', 64-char sha256 namespace)
non-coordination route -> null
```

- [ ] **Step 2: Add the failing Wrangler configuration test**

Extend `apps/web/tests/deploy-config.test.ts` with:

```ts
it('configures the global fiscal-coordination rate limiter before Durable Object access', async () => {
  const raw = await readFile(rootWranglerUrl, 'utf8');
  const config = JSON.parse(raw) as {
    ratelimits?: Array<{
      name?: string;
      simple?: { limit?: number; period?: number };
    }>;
  };

  expect(config.ratelimits).toEqual(expect.arrayContaining([
    expect.objectContaining({
      name: 'COORDINATION_RATE_LIMITER',
      simple: { limit: 300, period: 60 },
    }),
  ]));
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

```bash
npm run test:web -- --run apps/web/tests/fiscal-coordinator-worker.test.ts apps/web/tests/deploy-config.test.ts
```

Expected: FAIL because `worker/fiscal-coordination-http.ts` and the `ratelimits` binding do not exist on current `main`.

- [ ] **Step 4: Commit the RED contract**

```bash
git add apps/web/tests/fiscal-coordinator-worker.test.ts apps/web/tests/deploy-config.test.ts
git commit -m "test: define fiscal coordination HTTP gate"
```

---

### Task 3: Implement the Worker gate and make it GREEN

**Files:**
- Create: `worker/fiscal-coordination-http.ts`
- Modify: `worker/index.ts`
- Modify: `wrangler.jsonc`
- Modify: `docs/architecture/fiscal-usage-guard.md`
- Modify: `README.md`
- Test: `apps/web/tests/fiscal-coordinator-worker.test.ts`
- Test: `apps/web/tests/deploy-config.test.ts`

**Interfaces:**
- Consumes: `FiscalCoordinationDecision` from `worker/fiscal-coordinator-core.ts` and the interface defined in Task 2.
- Produces: `COORDINATION_RATE_LIMIT_KEY`, `COORDINATION_RATE_LIMIT_PERIOD_SECONDS`, `handleFiscalCoordinationRequest`.

- [ ] **Step 1: Implement the minimal HTTP handler**

Create `worker/fiscal-coordination-http.ts` with this behavior:

```ts
import type { FiscalCoordinationDecision } from './fiscal-coordinator-core';

export const COORDINATION_RATE_LIMIT_KEY = 'fiscal-coordination';
export const COORDINATION_RATE_LIMIT_PERIOD_SECONDS = 60;
const COORDINATION_PREFIX = '/api/fiscal-coordination/';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type FiscalOperation = 'reserve' | 'block';

type FiscalCoordinationDependencies = Readonly<{
  rateLimit: () => Promise<unknown>;
  executeFiscal: (operation: FiscalOperation, namespace: string) => Promise<FiscalCoordinationDecision>;
}>;

export async function handleFiscalCoordinationRequest(
  request: Request,
  dependencies: FiscalCoordinationDependencies,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(COORDINATION_PREFIX)) return null;
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });

  const token = bearerToken(request.headers.get('Authorization'));
  if (!token) return json({ error: 'unauthorized' }, 401);

  const operation = routeOperation(url.pathname);
  if (operation === null) return json({ error: 'not_found' }, 404);

  let result: unknown;
  try {
    result = await dependencies.rateLimit();
  } catch {
    return json({ error: 'rate_limiter_unavailable' }, 503);
  }
  if (!isRateLimitResult(result)) return json({ error: 'rate_limiter_unavailable' }, 503);
  if (!result.success) {
    return json(
      { error: 'rate_limited', retryAfterSeconds: COORDINATION_RATE_LIMIT_PERIOD_SECONDS },
      429,
      { 'Retry-After': String(COORDINATION_RATE_LIMIT_PERIOD_SECONDS) },
    );
  }

  const namespace = await sha256Hex(token);
  return decisionResponse(await dependencies.executeFiscal(operation, namespace));
}
```

Implement the small private helpers `routeOperation`, `bearerToken`, `isRateLimitResult`, `sha256Hex`, `decisionResponse` and `json` exactly to preserve the existing JSON shape and `Cache-Control: no-store`.

- [ ] **Step 2: Wire the real bindings in `worker/index.ts`**

Replace only the HTTP routing portion with:

```ts
const coordinationResponse = await handleFiscalCoordinationRequest(request, {
  rateLimit: () => env.COORDINATION_RATE_LIMITER.limit({ key: COORDINATION_RATE_LIMIT_KEY }),
  executeFiscal: async (operation, namespace) => {
    const stub = env.FISCAL_COORDINATOR.getByName(namespace);
    return operation === 'reserve' ? stub.reserve() : stub.block();
  },
});
return coordinationResponse ?? env.ASSETS.fetch(request);
```

Keep `FiscalCoordinator.reserve()` and `.block()` unchanged.

- [ ] **Step 3: Add the Wrangler binding**

Add before `durable_objects` in `wrangler.jsonc`:

```json
"ratelimits": [
  {
    "name": "COORDINATION_RATE_LIMITER",
    "namespace_id": "1361318030",
    "simple": { "limit": 300, "period": 60 }
  }
],
```

Use the repository's actual Cloudflare namespace/account configuration at execution time if Wrangler rejects this existing PR #7 value; do not invent a replacement ID. A rejected dry-run is a stop condition until the binding is valid.

- [ ] **Step 4: Run focused tests and make GREEN**

```bash
npm run test:web -- --run apps/web/tests/fiscal-coordinator-worker.test.ts apps/web/tests/deploy-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the web gate**

```bash
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
./node_modules/.bin/wrangler deploy --dry-run
```

Expected: all exit 0.

- [ ] **Step 6: Update security documentation**

In `docs/architecture/fiscal-usage-guard.md` and `README.md`, state explicitly:

```text
COORDINATION_RATE_LIMITER = coarse HTTP abuse/cost barrier, 300 requests/60s, not exact fiscal accounting.
FiscalUsageGuard + FiscalCoordinator = exact conservative fiscal protection.
Limiter denial = HTTP 429; limiter unavailable/invalid = HTTP 503; neither path touches FiscalCoordinator.
No CNPJ, NF-e key, XML, PFX, password or private key is added to Cloudflare traffic.
```

- [ ] **Step 7: Commit the implementation**

```bash
git add worker/fiscal-coordination-http.ts worker/index.ts wrangler.jsonc apps/web/tests docs/architecture/fiscal-usage-guard.md README.md
git commit -m "feat: harden fiscal coordination HTTP gate"
```

- [ ] **Step 8: Open PR A and require full CI/CodeQL**

Expected: PR contains only Worker gate/tests/config/docs. Merge only after all applicable checks are green and diff review confirms no change to fiscal coordinator state transitions.

---

### Task 4: Extract the batch controller

**Files:**
- Create: `apps/web/src/batch/controller.ts`
- Create: `apps/web/tests/batch-controller.test.ts`
- Modify: `apps/web/src/main.ts`
- Modify: technical frontend documentation/README only where module ownership is described

**Interfaces:**
- Consumes: existing `BridgeClient`, `PortalFallbackController`, `parseBatchInput`, `createStoredZip`, `parseNfeXml`, `renderDanfe` callbacks supplied by composition root.
- Produces:

```ts
export type BatchController = Readonly<{
  syncDraft(): void;
  start(): Promise<void>;
  cancel(): Promise<void>;
  downloadZip(): void;
  printDanfes(): void;
  isBusy(): boolean;
  dispose(): void;
}>;

export function createBatchController(deps: BatchControllerDependencies): BatchController;
```

`BatchControllerDependencies` must contain DOM elements and explicit callbacks/clients; it must not reach into module-level variables from `main.ts`.

- [ ] **Step 1: Start a fresh branch from the merged PR A `main`**

```bash
git switch main
git pull --ff-only
git switch -c refactor/batch-controller
```

- [ ] **Step 2: Write characterization tests before moving code**

Create `apps/web/tests/batch-controller.test.ts` with fake dependencies and assert at minimum:

```text
empty/invalid draft disables start
valid unique keys create queued items in input order
batch processes one item at a time
consumption_limit switches remaining batch route to Portal
cStat 217 uses Portal only for that eligible item
certificate_error cancels remaining direct work
cancel aborts current work and marks queued items cancelled
successful XML is parsed and becomes downloadable/printable
ZIP action contains only successful XMLs
print action contains only successful parsed DANFEs
manual Portal cancellation does not create an automatic fiscal retry
```

Use fakes that count calls; no real Bridge/Portal/network.

- [ ] **Step 3: Run the new focused test before extraction**

```bash
npm run test:web -- --run apps/web/tests/batch-controller.test.ts
```

Expected: FAIL because `createBatchController` does not exist.

- [ ] **Step 4: Move only batch-owned state and functions**

Move from `main.ts` into `batch/controller.ts` the existing batch types/state and functions for draft, start/cancel, direct item processing, Portal item processing, completion, rendering, ZIP and batch printing. Preserve strings, statuses and ordering exactly.

Do not move `BridgeClient` implementation, `PortalFallbackController` implementation, XML parser or DANFE renderer.

- [ ] **Step 5: Wire the controller in `main.ts`**

`main.ts` should instantiate the controller with existing elements/clients and replace direct handlers with calls such as:

```ts
batchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void batchController.start();
});
batchKeysInput.addEventListener('input', () => batchController.syncDraft());
batchCancel.addEventListener('click', () => void batchController.cancel());
batchZip.addEventListener('click', () => batchController.downloadZip());
batchPrint.addEventListener('click', () => batchController.printDanfes());
```

Use `batchController.isBusy()` in mode switching instead of old globals.

- [ ] **Step 6: Run focused and full web gates**

```bash
npm run test:web -- --run apps/web/tests/batch-controller.test.ts apps/web/tests/batch-input.test.ts apps/web/tests/batch-zip.test.ts
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
./node_modules/.bin/wrangler deploy --dry-run
```

Expected: all pass; no deliberate DOM/text change.

- [ ] **Step 7: Commit and open PR B**

```bash
git add apps/web/src/batch/controller.ts apps/web/src/main.ts apps/web/tests/batch-controller.test.ts docs README.md
git commit -m "refactor: extract batch consultation controller"
```

Merge only after full CI/CodeQL is green.

---

### Task 5: Extract the single-NF-e consultation controller

**Files:**
- Create: `apps/web/src/nfe/consultation-controller.ts`
- Create: `apps/web/tests/consultation-controller.test.ts`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- Consumes: `BridgeClient`, `PortalFallbackController`, `validateAccessKey`, `parseNfeXml`, rendering callbacks.
- Produces:

```ts
export type ConsultationController = Readonly<{
  submit(): Promise<void>;
  reset(): void;
  cancelActivePortal(): Promise<void>;
  isPortalActive(): boolean;
}>;

export function createConsultationController(
  deps: ConsultationControllerDependencies,
): ConsultationController;
```

- [ ] **Step 1: Branch from current `main` after PR B**

```bash
git switch main
git pull --ff-only
git switch -c refactor/single-consultation-controller
```

- [ ] **Step 2: Write characterization tests**

Cover exactly:

```text
invalid key -> no Bridge call, error rendered, input focused
success+xml -> parse against requested key and render success
invalid returned XML -> invalid-XML state
consumption_limit -> Portal fallback
fiscal_status cStat 217 -> Portal fallback
other fiscal_status -> no Portal fallback
Bridge throw -> consultation failure state
Portal completed+xml -> parse and render success
Portal cancelled -> cancelled state
Portal failed -> unavailable state
busy state always clears in finally
reset revokes current download URL and restores empty state
pagehide cancellation is best-effort and never starts a fiscal retry
```

- [ ] **Step 3: Verify RED**

```bash
npm run test:web -- --run apps/web/tests/consultation-controller.test.ts
```

Expected: FAIL because the controller module does not exist.

- [ ] **Step 4: Extract existing single consultation behavior**

Move `submitLookup`, eligible Portal fallback orchestration, single-result busy/reset state and active Portal operation ownership into the controller. Preserve current Portuguese copy and categories exactly.

- [ ] **Step 5: Wire `main.ts`**

Keep markup and DOM lookup in `main.ts`; inject elements/callbacks into the controller. `pagehide` calls controller cancellation and batch disposal/cancel as applicable.

- [ ] **Step 6: Verify GREEN and full gate**

```bash
npm run test:web -- --run apps/web/tests/consultation-controller.test.ts apps/web/tests/access-key.test.ts apps/web/tests/portal-fallback.test.ts
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
./node_modules/.bin/wrangler deploy --dry-run
```

Expected: all pass.

- [ ] **Step 7: Commit and open PR C**

```bash
git add apps/web/src/nfe/consultation-controller.ts apps/web/src/main.ts apps/web/tests/consultation-controller.test.ts
git commit -m "refactor: extract single consultation controller"
```

Merge only after full CI/CodeQL.

---

### Task 6: Extract certificate/Bridge UI coordination

**Files:**
- Create: `apps/web/src/bridge/certificate-controller.ts`
- Create: `apps/web/tests/certificate-controller.test.ts`
- Modify: `apps/web/src/main.ts`
- Preserve: `apps/web/src/bridge/client.ts`

**Interfaces:**
- Consumes: existing `BridgeClient` and certificate DOM elements.
- Produces:

```ts
export type CertificateController = Readonly<{
  refresh(): Promise<void>;
  applySelection(): Promise<void>;
}>;

export function createCertificateController(
  deps: CertificateControllerDependencies,
): CertificateController;
```

- [ ] **Step 1: Branch from current `main` after PR C**

```bash
git switch main
git pull --ff-only
git switch -c refactor/certificate-controller
```

- [ ] **Step 2: Write characterization tests**

Cover:

```text
refresh starts in checking and disables controls
health success + catalog -> connected state and catalog rendered
local permission error -> permission state
other health/list failure -> missing state and unavailable catalog
apply with empty thumbprint -> no Bridge call
apply valid thumbprint -> select, reload catalog, success help text
apply failure -> readable error and controls restored when options exist
PFX/password/private-key data never appears in UI contract
```

- [ ] **Step 3: Verify RED**

```bash
npm run test:web -- --run apps/web/tests/certificate-controller.test.ts
```

Expected: FAIL because controller does not exist.

- [ ] **Step 4: Extract existing certificate UI functions**

Move `refreshBridgeAndCertificates`, `applyCertificateSelection`, catalog rendering and bridge/certificate UI state helpers that are exclusively owned by this flow. Keep `BridgeClient` unchanged.

- [ ] **Step 5: Wire `main.ts` and verify**

```bash
npm run test:web -- --run apps/web/tests/certificate-controller.test.ts apps/web/tests/bridge-client.test.ts
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
./node_modules/.bin/wrangler deploy --dry-run
```

Expected: all pass.

- [ ] **Step 6: Commit and open PR D**

```bash
git add apps/web/src/bridge/certificate-controller.ts apps/web/src/main.ts apps/web/tests/certificate-controller.test.ts
git commit -m "refactor: extract certificate UI controller"
```

Merge only after full CI/CodeQL.

---

### Task 7: Decide and, only if necessary, extract the DANFE viewer

**Files:**
- Inspect: `apps/web/src/main.ts`
- Optional Create: `apps/web/src/danfe/viewer.ts`
- Optional Create: `apps/web/tests/danfe-viewer.test.ts`
- Optional Modify: `apps/web/src/main.ts`
- Must not modify: `apps/web/src/danfe/render.ts`, product table contract or pagination unless an independent regression is proven.

**Interfaces if extraction is needed:**

```ts
export type DanfeViewer = Readonly<{
  open(parsed: ParsedNfe): void;
  close(): void;
  print(): void;
  dispose(): void;
}>;

export function createDanfeViewer(deps: DanfeViewerDependencies): DanfeViewer;
```

- [ ] **Step 1: Review `main.ts` after Tasks 4–6**

Decision rule: if viewer ownership is already small/clear (only a few event handlers and calls), record `viewer extraction not needed` in the PR/architecture docs and do not create another abstraction. If it still owns zoom lifecycle, modal state, print, backdrop/Escape and rendered content as a cohesive block, continue.

- [ ] **Step 2: If needed, branch and write RED tests**

Cover:

```text
open renders current ParsedNfe and unhides modal
open attaches zoom once
close hides modal and detaches zoom
Escape closes only when visible
backdrop closes; clicks inside modal do not
print calls window.print
reopening replaces content without leaked zoom listener
```

Run:

```bash
npm run test:web -- --run apps/web/tests/danfe-viewer.test.ts
```

Expected: FAIL before extraction.

- [ ] **Step 3: Extract only viewer lifecycle**

Do not move renderer/pagination/fiscal layout.

- [ ] **Step 4: Run all DANFE gates**

```bash
npm run test:web -- --run apps/web/tests/danfe-viewer.test.ts apps/web/tests/danfe.test.ts apps/web/tests/danfe-product-table-regression.test.ts
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
npm test --prefix tests/playwright
```

Expected: all pass, including real Chromium A4 regression.

- [ ] **Step 5: Commit/open PR E only if code changed**

```bash
git add apps/web/src/danfe/viewer.ts apps/web/src/main.ts apps/web/tests/danfe-viewer.test.ts
git commit -m "refactor: extract DANFE viewer lifecycle"
```

If no extraction was needed, make no production-code commit for this task.

---

### Task 8: Close the PR #7 migration loop and document frontend boundaries

**Files:**
- Modify: `README.md` and/or existing architecture doc that describes frontend modules
- PR metadata: close PR #7 only after verification

**Interfaces:**
- Consumes: merged PRs A–E or explicit no-op decision for E.
- Produces: no ambiguous old branch debt.

- [ ] **Step 1: Compare PR #7 material with merged `main`**

Expected mapping:

```text
rate-limit implementation/tests/config -> PR A
web-main-refactor design -> PRs B/C/D/(E if needed)
repository/signing design -> Tasks 9/10 documentation
```

- [ ] **Step 2: Update architecture documentation with actual module ownership**

Document the real final files and responsibilities; do not document proposed files that were not created.

- [ ] **Step 3: Close PR #7 as superseded**

Add a concise PR comment linking the replacement PRs and close it. Do not merge it.

- [ ] **Step 4: Verify `main` full CI/CodeQL before external controls**

Expected: all current gates green.

---

### Task 9: Configure and validate `main` protection

**Files:**
- Modify after real validation: `docs/operations/repository-hardening.md`
- Modify after real validation: `docs/testing/acceptance.md`
- GitHub administrative configuration: ruleset `main-protection`

**Interfaces:**
- Consumes: actual CI job names from `.github/workflows/ci.yml`: `web`, `danfe-print`, `bridge`, `fiscal-compatibility`, `windows-package`.
- Produces: enforced default-branch gate.

- [ ] **Step 1: Configure the ruleset in GitHub administration**

Set exactly:

```text
name: main-protection
target: main/default branch
enforcement: Active
block deletion: yes
block force push: yes
require pull request: yes
required approvals: 0
require conversation resolution: yes
require branch up to date: yes
required checks: web, danfe-print, bridge, fiscal-compatibility, windows-package
normal bypass: none
```

If the current GitHub integration lacks administration write permission, this is an explicit owner action; do not simulate completion in code.

- [ ] **Step 2: Validate pending-check blocking with a minimal PR**

Create a documentation-only PR and observe that merge is unavailable while a required check is pending.

Expected: merge blocked.

- [ ] **Step 3: Validate failing-check blocking safely**

Use a temporary test branch/PR that intentionally fails a non-production test/check; do not merge that branch.

Expected: merge blocked while required check fails. Delete/close the test PR afterward.

- [ ] **Step 4: Validate successful merge gate**

Use a clean documentation-only PR with all required checks green.

Expected: merge becomes permitted only after conditions are satisfied.

- [ ] **Step 5: Record evidence**

Update `docs/operations/repository-hardening.md` and the hardening table in `docs/testing/acceptance.md` with date and actual state. Commit through the protected PR flow.

---

### Task 10: Activate Authenticode only when a real certificate exists

**Files:**
- Inspect: `.github/workflows/ci.yml`
- Inspect: `scripts/sign-windows-artifacts.ps1`
- Modify only if real validation finds a defect: those files
- Modify after validation: `docs/operations/repository-hardening.md`, `docs/testing/acceptance.md`

**Interfaces:**
- Consumes secrets `CODE_SIGNING_PFX_BASE64` and `CODE_SIGNING_PFX_PASSWORD` in a protected GitHub Environment/release path.
- Produces signed `NfeAgendamento.App.exe`, `NfeAgendamento.Bridge.exe`, `NfeAgendamento.Portal.exe`, `NFeAgendamentoBridge-Setup-v<version>.exe`.

- [ ] **Step 1: Gate on certificate availability**

Verify the certificate has a private key and EKU `1.3.6.1.5.5.7.3.3` (Code Signing).

Expected: if no real certificate exists, mark this task `blocked by external prerequisite`, leave pipeline unchanged and keep docs explicitly pending.

- [ ] **Step 2: Configure protected secrets without exposing them to PRs**

Store only:

```text
CODE_SIGNING_PFX_BASE64
CODE_SIGNING_PFX_PASSWORD
```

Never commit PFX/Base64/password.

- [ ] **Step 3: Run a real main/release build**

Expected: signing steps execute only on `push` to `refs/heads/main`; PR builds do not receive signing secrets.

- [ ] **Step 4: Verify all four artifacts**

On Windows runner/artifact validation:

```powershell
signtool verify /pa NfeAgendamento.App.exe
signtool verify /pa NfeAgendamento.Bridge.exe
signtool verify /pa NfeAgendamento.Portal.exe
signtool verify /pa NFeAgendamentoBridge-Setup-v<version>.exe
```

Expected: all exit 0, SHA-256 signature and RFC 3161 timestamp present.

- [ ] **Step 5: Record the real state**

Update hardening/acceptance docs only after the artifact evidence exists.

---

### Task 11: Execute physical Windows acceptance

**Files:**
- Modify: `docs/testing/acceptance.md`
- Modify as applicable: `docs/testing/batch-query.md`
- Modify as applicable: `docs/testing/danfe-layout.md`
- Modify as applicable: `docs/testing/portal-post-hcaptcha.md`
- Modify as applicable: `docs/testing/bridge-updater.md`

**Interfaces:**
- Consumes: Setup artifact from the same green CI SHA being tested, Windows 10/11 x64, A1 real, WebView2 Runtime, official site/SEFAZ/Portal access.
- Produces: dated evidence distinguishing pass/fail/not-tested.

- [ ] **Step 1: Fill the acceptance header before testing**

Record:

```text
Data
Commit SHA
Versão canônica
Run CI / artifact
URL oficial
Windows
Navegador + versão
PC
```

- [ ] **Step 2: Validate installation/App/Bridge lifecycle**

Execute acceptance sections 0–2.1: install without admin, tray, no console, single instance, auto-start, Bridge restart/backoff, official Origin/loopback and diagnostics.

Expected: each item receives actual pass/fail evidence.

- [ ] **Step 3: Validate A1 and key validation**

Execute sections 3–4: A1 listing/selection/persistence, no private material in network responses, numeric and alphanumeric model 55 keys, explicit model 65 rejection.

- [ ] **Step 4: Validate direct SEFAZ and single DANFE**

Execute sections 5–7: one known authorized NF-e, no automatic fiscal retry, XML `infNFe/@Id` match, approved 13-column DANFE, Ctrl+scroll, A4 print/PDF and failure states.

- [ ] **Step 5: Validate batch**

Run a 2–3 key batch and the current maximum 10-key batch. Confirm serial processing, invalid/duplicate handling, cancel, ZIP, batch DANFE print and legitimate Portal fallback when naturally available.

- [ ] **Step 6: Validate Portal/hCaptcha manually**

Execute sections 8–9 only with a legitimate eligible fallback. hCaptcha remains manual. Confirm official host, prefilled key, WebView2 behavior, official XML download, XML/key match, cancellation/recovery and external navigation/download blocking.

- [ ] **Step 7: Validate updater/uninstall/second PC when applicable**

Execute sections 10–12. For updater, use the real previous/current versions available at that time rather than blindly retaining `0.0.13 -> 0.0.14` if the release candidate has advanced.

- [ ] **Step 8: Record failures without papering over them**

Any failed physical item becomes a separate bugfix cycle using `superpowers:systematic-debugging` + TDD where automatable. Do not mark the roadmap/release physically validated until required failures are resolved or explicitly scoped out with user approval.

---

### Task 12: Prepare the patch release

**Files:**
- Modify: `Directory.Build.props`
- Create: `docs/releases/v0.0.15.md` if `0.0.15` remains next
- Modify: `README.md`
- Modify: all docs whose current-version/status text changes
- Release metadata/tag after CI

**Interfaces:**
- Consumes: merged code PRs, external-control state, physical acceptance evidence.
- Produces: one release whose tag/assets all correspond to one validated SHA.

- [ ] **Step 1: Re-read canonical version from current `main`**

```bash
grep -n '<Version>' Directory.Build.props
```

Expected at spec time: `0.0.14`. If current value is still `0.0.14`, choose `0.0.15`; otherwise compute the next patch from the actual current version and use that consistently.

- [ ] **Step 2: Update version and release documentation together**

For `0.0.15`, change:

```xml
<Version>0.0.15</Version>
```

Create `docs/releases/v0.0.15.md` containing only shipped changes and actual validation state:

```text
Worker HTTP abuse gate
frontend structural extractions actually merged
main-protection real state
Authenticode real state (configured or explicitly pending)
physical acceptance summary
known external pending items, if any
```

Update download/version references in README and testing docs from actual previous version to actual new version.

- [ ] **Step 3: Run the full local/pre-PR gate**

```bash
npm ci
npm audit --audit-level=high
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
./node_modules/.bin/wrangler deploy --dry-run
npm ci --prefix tests/playwright
npm audit --prefix tests/playwright --audit-level=high
npm test --prefix tests/playwright
bash apps/bridge/tests/bootstrap.sh
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release --no-restore
dotnet run --project tests/unimake-poc/UnimakePoc.csproj -c Release
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit the release candidate**

```bash
git add Directory.Build.props README.md docs
git commit -m "release: v0.0.15"
```

Use the actual version in the message if it changed from the spec-time expectation.

- [ ] **Step 5: Open final release PR and wait for all gates**

Expected: required CI jobs and CodeQL green on the exact release-candidate SHA; branch protection enforced if Task 9 was possible.

- [ ] **Step 6: Merge and verify the exact main SHA**

After merge, capture the resulting `main` SHA and verify its push CI. Do not tag a different SHA.

- [ ] **Step 7: Publish tag/release from the validated SHA**

Create tag `v<version>` pointing to the verified main SHA and publish only artifacts produced from that same SHA/run.

- [ ] **Step 8: Verify release integrity**

Confirm release tag, Setup asset, technical package, SHA-256/hash metadata and Authenticode signatures when Task 10 is active. If Authenticode remains externally unavailable, release notes must say so explicitly rather than implying publisher verification.

---

## Final self-review checklist

- Spec coverage: Tasks 1–12 cover all six roadmap phases plus PR #7 retirement.
- TDD coverage: Worker and every frontend extraction begin with explicit RED tests; external controls use real-world validation gates instead of fake unit completion.
- Architecture: site + per-PC App/Bridge + Portal Helper + Cloudflare Worker/Durable Object remains unchanged.
- Privacy: no new fiscal/personal payload is introduced in Cloudflare coordination.
- DANFE: renderer/layout/pagination are outside refactor scope and Playwright A4 is mandatory if viewer wiring changes.
- Dependencies: no new runtime/dev dependency is planned.
- Release: version is re-read from current `main`; `0.0.15` is conditional on `0.0.14` still being current.
- External blockers: branch administration and code-signing certificate are never falsely marked complete.
- No placeholders: execution decisions have explicit stop conditions and concrete commands/contracts.