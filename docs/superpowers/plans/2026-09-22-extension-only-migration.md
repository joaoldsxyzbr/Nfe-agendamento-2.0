# Extension-Only Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a dependência do Bridge e deixar o NFe Agendamento operando somente com site + extensão Chromium MV3 + certificado A1 instalado no Windows.

**Architecture:** O site deixa de fazer consulta direta `NFeDistribuicaoDFe` e passa a iniciar sempre o Portal Nacional por meio da extensão. O navegador/Windows assume autenticação TLS com A1; a extensão automatiza somente o fluxo autorizado do Portal e devolve o XML ao site. A remoção física de Bridge/WebView2/.NET ocorre apenas depois de um gate físico sem Bridge.

**Tech Stack:** Vite 8, TypeScript 7, Vitest 5, Chrome/Edge Manifest V3, esbuild, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-22-extension-only-architecture-design.md`

## Global Constraints

- hCaptcha permanece 100% manual.
- Não usar Native Messaging.
- Não usar `<all_urls>`.
- Não colocar PFX/P12/PEM/chave privada dentro da extensão.
- Não usar `certificateProvider` ou `enterprise.platformKeys` para desktop Windows.
- A1 continua instalado no Windows e é usado pelo próprio navegador.
- XML máximo 10 MiB, DTD proibido e validação contra a chave consultada.
- CNPJ/CPF real de fornecedor não pode entrar no bundle, Worker, GitHub ou logs.
- Lote continua sequencial; uma operação Portal por vez.
- v0.0.21 permanece rollback estável até o gate físico sem Bridge.
- Nenhum projeto Windows é removido antes do gate físico.
- A extensão continua limitada ao domínio oficial do NFe Agendamento e `www.nfe.fazenda.gov.br`.

## Review Focus

- navegador com mais de um A1 elegível: o produto deve deixar a seleção para Chrome/Edge sem tentar enumerar certificados;
- resposta do `start` perdida após popup criado: nunca abrir uma segunda operação automaticamente;
- service worker suspenso durante hCaptcha: operação deve sobreviver via `chrome.storage.session`;
- configuração privada de fornecedor ausente/corrompida: falhar como `supplierId: null` sem impedir XML/DANFE;
- Portal alterando DOM/download: falhar fechado, sem permissões amplas e sem fallback nativo oculto.

---

### Task 1: Expandir o protocolo da extensão para diagnóstico e fornecedor local

**Files:**
- Modify: `apps/extension/src/protocol.ts`
- Modify: `apps/extension/src/background.ts`
- Create: `apps/extension/src/supplier-store.ts`
- Modify: `apps/extension/src/site-bridge.ts`
- Modify: `apps/web/src/portal/extension-client.ts`
- Test: `apps/extension/tests/protocol.test.ts`
- Create: `apps/extension/tests/supplier-store.test.ts`
- Modify: `apps/web/tests/portal-extension.test.ts`

**Interfaces:**
- Produces: `BrowserPortalExtensionClient.resolveSupplier(taxId: string): Promise<{ supplierId: string | null }>`
- Produces handshake `ready.capabilities.portalLookup === true`
- Produces handshake `ready.capabilities.supplierResolution === true`

- [ ] **Step 1: Write failing protocol tests**

Adicionar ao protocolo:

```ts
type ExtensionCommand =
  | { type: 'ping'; requestId: string }
  | { type: 'start'; requestId: string; accessKey: string }
  | { type: 'cancel'; requestId: string; operationId: string }
  | { type: 'resolve_supplier'; requestId: string; taxId: string };
```

Teste:

```ts
expect(parseSiteCommand({
  type: 'resolve_supplier',
  requestId: 'req-1',
  taxId: '12.345.678/0001-95',
})).toEqual({
  type: 'resolve_supplier',
  requestId: 'req-1',
  taxId: '12345678000195',
});
```

Também testar CNPJ alfanumérico válido, CPF válido, símbolos inválidos e campo vazio.

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:extension
npm run test:web
```

Expected: FAIL porque `resolve_supplier` e `resolveSupplier` ainda não existem.

- [ ] **Step 3: Implement supplier-store local**

Criar API pura:

```ts
export type LocalSupplierConfig = Readonly<{
  version: 1;
  suppliers: readonly Readonly<{
    id: string;
    taxIds: readonly string[];
  }>[];
}>;

export function normalizeTaxId(value: string): string;
export function validateSupplierConfig(value: unknown): LocalSupplierConfig;
export function resolveSupplierFromConfig(
  config: LocalSupplierConfig | null,
  taxId: string,
): string | null;
```

Persistência:

```ts
const SUPPLIER_CONFIG_KEY = 'supplierRulesV1';

export async function loadSupplierConfig(): Promise<LocalSupplierConfig | null>;
export async function saveSupplierConfig(config: LocalSupplierConfig): Promise<void>;
```

Usar `chrome.storage.local`; nunca `sync`.

- [ ] **Step 4: Implement protocol/background/web client**

No `ping` retornar:

```ts
{
  type: 'ready',
  requestId,
  version,
  capabilities: {
    portalLookup: true,
    supplierResolution: true,
  },
}
```

No `resolve_supplier`:

```ts
return {
  type: 'supplier_resolved',
  requestId,
  supplierId: resolveSupplierFromConfig(await loadSupplierConfig(), command.taxId),
};
```

No site:

```ts
async resolveSupplier(taxId: string): Promise<{ supplierId: string | null }>
```

- [ ] **Step 5: Run GREEN**

Run:

```bash
npm run test:extension
npm run test:web
npm run build:extension
npm run build:web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/extension apps/web/src/portal apps/web/tests
git commit -m "feat: adicionar diagnóstico e fornecedores à extensão"
```

---

### Task 2: Criar importação local das regras de fornecedor na extensão

**Files:**
- Modify: `apps/extension/manifest.json`
- Create: `apps/extension/options.html`
- Create: `apps/extension/src/options.ts`
- Modify: `apps/extension/scripts/build.mjs`
- Create: `apps/extension/tests/options.test.ts`
- Modify: `docs/architecture/supplier-rules.md`

**Interfaces:**
- Consumes: `validateSupplierConfig()`, `saveSupplierConfig()`
- Produces: página de opções local da extensão

- [ ] **Step 1: Write failing options tests**

Testar que o manifest aponta:

```json
{
  "options_page": "options.html"
}
```

E que o build final contém:

```text
options.html
options.js
```

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:extension
```

Expected: FAIL por assets ausentes.

- [ ] **Step 3: Implement options page**

A página deve aceitar apenas arquivo `.json` escolhido explicitamente.

Fluxo:

```ts
file input
  -> file.text()
  -> JSON.parse()
  -> validateSupplierConfig()
  -> saveSupplierConfig()
  -> mostrar "Configuração salva neste navegador."
```

Nunca enviar o conteúdo por `fetch`, `postMessage` ou telemetria.

Adicionar botão:

```text
Limpar configuração local
```

que remove somente `supplierRulesV1`.

- [ ] **Step 4: Build assets**

Atualizar `build.mjs` para gerar `options.js` e copiar `options.html`.

- [ ] **Step 5: Run GREEN**

```bash
npm run test:extension
npm run build:extension
```

Expected: PASS e `apps/extension/dist/options.html` presente.

- [ ] **Step 6: Commit**

```bash
git add apps/extension docs/architecture/supplier-rules.md
git commit -m "feat: armazenar regras privadas na extensão"
```

---

### Task 3: Criar gate físico sem Bridge antes de mudar o fluxo principal

**Files:**
- Create: `apps/web/extension-test.html`
- Create: `apps/web/src/extension-only-smoke.ts`
- Create: `apps/web/tests/extension-only-smoke.test.ts`
- Modify: `docs/testing/browser-extension-portal.md`

**Interfaces:**
- Consumes: `BrowserPortalExtensionClient`
- Consumes: `parseNfeXml(xml, accessKey)`
- Produces: página isolada `/extension-test.html`, sem `BridgeClient`

- [ ] **Step 1: Write failing smoke test**

O módulo deve ter:

```ts
export async function runExtensionOnlySmoke(
  accessKey: string,
  extension: BrowserPortalExtensionClient,
): Promise<ParsedNfe>
```

Teste obrigatório:

```ts
expect(source).not.toContain('BridgeClient');
expect(source).not.toContain('127.0.0.1:17345');
```

E comportamento:

```ts
start -> waitForResult -> parseNfeXml -> resolveSupplier
```

- [ ] **Step 2: Run RED**

```bash
npm run test:web
```

Expected: FAIL por módulo/página ausentes.

- [ ] **Step 3: Implement smoke page**

UI mínima:

```text
Extensão: conectada / ausente
Versão: x.y.z
[ chave NF-e ]
[Testar consulta sem Bridge]
estado da operação
```

A página deve falhar imediatamente se a extensão não responder.

Não importar nenhum módulo `bridge/*`.

- [ ] **Step 4: Run GREEN**

```bash
npm run test:web
npm run build:web
```

Expected: PASS e Vite gera `extension-test.html`.

- [ ] **Step 5: Gate físico obrigatório**

Com Bridge parado/desinstalado:

1. instalar build da extensão;
2. abrir `/extension-test.html`;
3. confirmar handshake;
4. consultar NF-e real legítima;
5. confirmar popup;
6. chave preenchida;
7. resolver hCaptcha manualmente;
8. usar A1 pelo navegador;
9. XML retornar à página;
10. parser validar chave;
11. repetir uma segunda consulta;
12. fechar popup no meio e confirmar cancelamento;
13. testar Chrome;
14. repetir no Edge.

**STOP:** não executar Tasks 4–9 se XML/certificado falhar aqui.

Registrar somente resultado técnico; não registrar chave NF-e, XML, CNPJ ou certificado.

- [ ] **Step 6: Commit**

```bash
git add apps/web docs/testing/browser-extension-portal.md
git commit -m "test: adicionar gate físico sem Bridge"
```

---

### Task 4: Migrar consulta unitária para Portal-only

**Files:**
- Modify: `apps/web/src/nfe/consultation-controller.ts`
- Modify: `apps/web/tests/consultation-controller.test.ts`
- Modify: `apps/web/src/main.ts`
- Delete after GREEN: `apps/web/src/portal/router.ts`
- Delete after GREEN: `apps/web/src/portal/fallback.ts`
- Delete after GREEN: `apps/web/tests/portal-router.test.ts`

**Interfaces:**
- Consumes: `BrowserPortalExtensionClient.start/waitForResult/cancel/resolveSupplier`
- Removes: `ConsultationBridgeClient`

- [ ] **Step 1: Rewrite tests to Portal-only RED**

Novo dependency shape:

```ts
type ConsultationExtensionClient = Readonly<{
  isAvailable(signal?: AbortSignal): Promise<boolean>;
  start(accessKey: string, signal?: AbortSignal): Promise<string>;
  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus>;
  cancel(operationId: string): Promise<void>;
  resolveSupplier(taxId: string): Promise<{ supplierId: string | null }>;
}>;
```

Testes:

- chave inválida não abre extensão;
- extensão ausente mostra `Extensão não conectada`;
- chave válida abre Portal imediatamente;
- XML concluído é parseado uma vez;
- fornecedor resolve fail-soft;
- cancelamento fecha operação;
- falha do Portal não dispara nenhuma segunda rota;
- nenhum teste chama `lookupNfe`.

- [ ] **Step 2: Run RED**

```bash
npm run test:web
```

Expected: FAIL porque controller ainda exige `bridge`.

- [ ] **Step 3: Implement minimal Portal-only controller**

Fluxo de `submit()`:

```ts
validate key
-> extension.isAvailable()
-> extension.start(accessKey)
-> waitForResult(operationId)
-> parseNfeXml(xml, accessKey)
-> extension.resolveSupplier(parsed.issuer.taxId)
-> renderSuccess(...)
```

Mensagem inicial:

```text
Abrindo Portal Nacional da NF-e…
```

Remover textos de `SEFAZ pelo Bridge`.

- [ ] **Step 4: Wire main**

Substituir:

```ts
PortalRouter + PortalFallbackController + BridgeClient
```

por:

```ts
const portalExtension = new BrowserPortalExtensionClient();
```

para consulta unitária.

- [ ] **Step 5: Run GREEN**

```bash
npm run test:web
npm run build:web
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: consultar NF-e somente pela extensão"
```

---

### Task 5: Migrar lote para Portal-only sequencial

**Files:**
- Modify: `apps/web/src/batch/controller.ts`
- Modify: `apps/web/tests/batch-controller.test.ts`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- Consumes: mesmo `BrowserPortalExtensionClient`
- Removes: `BridgeBatchClient`, `BatchRoute`, source `SEFAZ`

- [ ] **Step 1: Write RED batch tests**

Testar:

```text
2 chaves válidas
-> start A
-> complete A
-> start B
-> complete B
```

Asserts:

```ts
expect(maxConcurrentPortalOperations).toBe(1);
expect(items.every(item => item.source === 'Portal')).toBe(true);
```

Também:

- cancelamento durante item A não abre item B;
- extensão ausente bloqueia o lote antes do primeiro popup;
- erro no item A não abre fallback nativo;
- fornecedor local é fail-soft;
- nenhum `health()`/certificado é exigido.

- [ ] **Step 2: Run RED**

```bash
npm run test:web -- --run apps/web/tests/batch-controller.test.ts
```

Expected: FAIL porque lote ainda começa com `bridge.health()`.

- [ ] **Step 3: Remove direct route**

Eliminar:

```ts
route: 'sefaz' | 'portal'
processDirectItem()
BridgeBatchClient
certificateSelected gate
```

O loop passa a chamar somente:

```ts
await processPortalItem(item, signal)
```

- [ ] **Step 4: Run GREEN**

```bash
npm run test:web
npm run build:web
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/batch apps/web/tests/batch-controller.test.ts apps/web/src/main.ts
git commit -m "feat: migrar lote para Portal-only"
```

---

### Task 6: Trocar UI/diagnóstico de Bridge por extensão

**Files:**
- Modify: `apps/web/src/main.ts`
- Replace: `apps/web/src/settings-panel.ts`
- Modify: `apps/web/src/settings-panel.css`
- Delete after GREEN: `apps/web/src/bridge/certificate-controller.ts`
- Delete/update related tests in `apps/web/tests`
- Create: `apps/web/tests/extension-status.test.ts`

**Interfaces:**
- Consumes: `BrowserPortalExtensionClient.isAvailable()`
- Consumes: handshake version/capabilities

- [ ] **Step 1: Write RED UI tests**

Expected header:

```text
Extensão conectada
```

ou:

```text
Extensão não instalada
```

Não pode existir na UI vigente:

```text
Bridge
Certificado A1 [select]
WebView2
Baixar componente Windows
```

- [ ] **Step 2: Run RED**

```bash
npm run test:web
```

- [ ] **Step 3: Replace status panel**

Novo painel:

```text
Integração do navegador
Extensão: conectada
Versão: 0.x.x
Portal: disponível
Regras locais: configuradas / não configuradas
[Verificar novamente]
[Abrir opções da extensão]
```

Se ausente:

```text
Extensão não instalada. Instale a extensão para consultar NF-e.
```

Botões de consulta ficam disabled.

- [ ] **Step 4: Remove certificate UI**

Excluir do HTML principal e dependências:

```ts
certificateController
certificateSelect
certificateApply
certificateState
certificateHelp
```

- [ ] **Step 5: Run GREEN**

```bash
npm run test:web
npm run build:web
```

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat: substituir diagnóstico do Bridge pela extensão"
```

---

### Task 7: Remover dependência web do Bridge

**Files:**
- Delete unused: `apps/web/src/bridge/*`
- Delete/update unused bridge tests
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/update/windows-update.ts` or delete when no longer referenced
- Modify: `apps/web/tests/*`

**Interfaces:**
- Produces invariant: bundle web não referencia `127.0.0.1:17345`

- [ ] **Step 1: Add repository invariant test**

Criar teste estático:

```ts
expect(webRuntimeSources).not.toContain('127.0.0.1:17345');
expect(webRuntimeSources).not.toContain('new BridgeClient');
expect(webRuntimeSources).not.toContain('/api/v1/certificates');
```

- [ ] **Step 2: Run RED**

Expected: FAIL.

- [ ] **Step 3: Delete dead Bridge web code**

Remover somente módulos sem consumidores.

Preservar contratos genéricos de Portal em arquivo novo, por exemplo:

```text
apps/web/src/portal/contracts.ts
```

Não manter `PortalOperationStatus` dentro de `bridge/contracts.ts`.

- [ ] **Step 4: Run GREEN**

```bash
npm run lint:web
npm run format:check:web
npm run test:web
npm run coverage:web
npm run build:web
```

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "refactor: remover Bridge do frontend"
```

---

### Task 8: Remover produto Windows somente após gate físico aprovado

**Files:**
- Delete: `apps/bridge/**`
- Delete: `installer/**` ou diretório Inno Setup vigente
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `Directory.Build.props` se não houver outro consumidor
- Modify: `package.json`
- Modify: `README.md`

**Gate:** Task 3 deve ter registro físico aprovado em Chrome e Edge.

- [ ] **Step 1: Write CI invariant**

O CI final deve ter jobs:

```text
web
extension
danfe-print
```

Não deve ter como requisito de produto:

```text
bridge
windows-package
Inno Setup
```

- [ ] **Step 2: Remove Windows build**

Excluir projetos e scripts somente depois de comprovar que nenhum import, workflow ou release vigente depende deles.

- [ ] **Step 3: Simplify release**

A release passa a publicar:

```text
NFeAgendamento-Extension-v<extensionVersion>.zip
```

Não publicar:

```text
NFeAgendamentoBridge-Setup-*.exe
NfeAgendamentoBridge-win-x64-*.zip
```

- [ ] **Step 4: Verify**

```bash
npm ci
npm audit --audit-level=high
npm run test:web
npm run build:web
npm run test:extension
npm run build:extension
npm test --prefix tests/playwright
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remover componente Windows"
```

---

### Task 9: Limpar infraestrutura Cloudflare obsoleta em mudança separada

**Files:**
- Inspect/modify: `apps/web/src/worker.ts` or current Worker entrypoint
- Modify: `wrangler.jsonc`
- Modify/delete tests de coordenação/update
- Modify: `docs/architecture/fiscal-usage-guard.md`
- Modify: `docs/architecture/frontend-boundaries.md`

**Interfaces:**
- Removes only infrastructure with zero consumers after Tasks 4–8.

- [ ] **Step 1: Add no-consumer proof**

Pesquisar e testar ausência de chamadas frontend para:

```text
/api/fiscal-coordination/*
/api/update/*
/downloads/windows/*
```

- [ ] **Step 2: Remove update proxy Windows**

Remover metadata/download do Setup e seus rate limiters/bindings se não tiverem outro consumidor.

- [ ] **Step 3: Remove fiscal coordinator**

Remover Durable Object/binding apenas se nenhuma rota vigente o usa.

- [ ] **Step 4: Dry-run Worker**

```bash
./node_modules/.bin/wrangler deploy --dry-run
```

Expected: PASS sem bindings órfãos.

- [ ] **Step 5: Commit**

```bash
git add wrangler.jsonc apps docs
git commit -m "refactor: remover infraestrutura fiscal obsoleta"
```

---

### Task 10: Atualizar documentação vigente e criar release extension-only

**Files:**
- Modify: `README.md`
- Modify: `docs/testing/acceptance.md`
- Modify: `docs/testing/browser-extension-portal.md`
- Modify: `docs/architecture/frontend-boundaries.md`
- Modify: `docs/architecture/supplier-rules.md`
- Modify: `docs/superpowers/plans/README.md`
- Create: `docs/releases/v<next>.md`

- [ ] **Step 1: Remove instructions atuais de Bridge**

Documentação vigente deve dizer:

```text
Requisitos:
- Chrome ou Edge compatível
- extensão NFe Agendamento
- certificado A1 instalado no Windows quando exigido pelo Portal
```

Não deve instruir instalar/rodar Bridge ou WebView2.

Documentos históricos podem continuar mencionando versões antigas.

- [ ] **Step 2: Update acceptance**

Aceitação final:

1. navegador sem Bridge instalado;
2. extensão conectada;
3. consulta unitária;
4. hCaptcha manual;
5. A1 via navegador;
6. XML;
7. DANFE;
8. segunda consulta;
9. lote;
10. cancelamento;
11. fornecedor local;
12. Chrome;
13. Edge;
14. extensão ausente gera diagnóstico correto.

- [ ] **Step 3: Whole-project verification**

```bash
npm ci
npm audit --audit-level=high
npm run lint:web
npm run format:check:web
npm run test:web
npm run coverage:web
npm run build:web
npm run test:extension
npm run build:extension
npm test --prefix tests/playwright
./node_modules/.bin/wrangler deploy --dry-run
```

Expected: todos verdes.

- [ ] **Step 4: Security review**

Confirmar no diff final:

```text
no <all_urls>
no Native Messaging
no captcha automation
no certificate/private-key code
no 127.0.0.1
no Windows installer
no supplier tax IDs
no XML/access-key logs
```

- [ ] **Step 5: Release**

Somente após CI + CodeQL + aceitação física:

```text
release: v<next>
```

A release publica a extensão validada pelo mesmo SHA.

- [ ] **Step 6: Commit docs/release metadata**

```bash
git add README.md docs .github
git commit -m "docs: concluir arquitetura extension-only"
```

## Execution order

```text
Task 1
  ↓
Task 2
  ↓
Task 3 ─── GATE FÍSICO SEM BRIDGE
              ↓ aprovado
Task 4
  ↓
Task 5
  ↓
Task 6
  ↓
Task 7
  ↓
Task 8
  ↓
Task 9
  ↓
Task 10
```

A Task 3 é o ponto de decisão. Se falhar por certificado ou captura de XML, preservar a v0.0.21 e corrigir somente a extensão até o fluxo funcionar; não remover Bridge nem ampliar permissões para forçar a migração.
