# NFe Agendamento 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o NFe Agendamento 2.0 como um site estático que concentra toda a experiência, parsing, DANFE e regras de apresentação, usando um Bridge Windows mínimo apenas para certificado A1, transporte SEFAZ e fallback WebView2/Portal.

**Architecture:** O site Vite + TypeScript chama exclusivamente `http://127.0.0.1:17345/api/v1`. O Bridge .NET 10 faz bind apenas em loopback, protege endpoints por allowlist de `Origin`/`Host`, nunca expõe chave privada e devolve XML/status bruto. DANFE, Fernando Klein e o pipeline de XML vivem integralmente no navegador.

**Tech Stack:** Vite, TypeScript, Vitest, HTML/CSS, Cloudflare Workers Static Assets, .NET 10, ASP.NET Core Minimal API, xUnit, WebView2 no fallback Portal.

**Spec:** `docs/superpowers/specs/2026-09-08-site-bridge-design.md`

## Global Constraints

- Site sem login, usuários, banco, histórico e consulta em lote.
- Não implementar Central, pareamento, liderança, fila compartilhada, pasta de rede ou servidor LAN.
- Bridge em `127.0.0.1:17345` somente.
- API local versionada em `/api/v1`.
- Site contém DANFE, parsing XML e Fernando Klein; Bridge não contém regras de apresentação.
- Certificado A1 e chave privada nunca saem do Bridge/Windows.
- Produção usa allowlist de `Origin`; CORS nunca usa `*`.
- Nenhuma falha ambígua dispara retry agressivo automático contra a SEFAZ.
- Fallback Portal não automatiza nem contorna captcha.
- Código aproveitado do projeto anterior é portado conscientemente, acompanhado dos testes relevantes.

---

## File Map

### Raiz
- `package.json` — comandos do workspace web.
- `README.md` — arquitetura, setup e estado funcional.
- `.gitignore` — artefatos Node/.NET/IDE.
- `.github/workflows/ci.yml` — build e testes web + Bridge.

### Site
- `apps/web/package.json` — dependências e scripts do frontend.
- `apps/web/index.html` — shell da aplicação.
- `apps/web/src/main.ts` — composição da UI e fluxo de consulta.
- `apps/web/src/styles.css` — layout base do site.
- `apps/web/src/bridge/client.ts` — cliente HTTP do Bridge.
- `apps/web/src/bridge/contracts.ts` — contratos TypeScript `/api/v1`.
- `apps/web/src/nfe/access-key.ts` — validação da chave.
- `apps/web/src/nfe/xml.ts` — parsing/validação do XML.
- `apps/web/src/nfe/product-mapping.ts` — Fernando Klein.
- `apps/web/src/danfe/render.ts` — DANFE.
- `apps/web/src/danfe/styles.css` — impressão/A4/visualização.
- `apps/web/src/portal/fallback.ts` — start/polling do fallback.
- `apps/web/tests/*` — Vitest.
- `apps/web/wrangler.jsonc` — Workers Static Assets.

### Bridge
- `apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj` — app ASP.NET Core Windows.
- `apps/bridge/src/NfeAgendamento.Bridge/Program.cs` — composição/endpoints.
- `apps/bridge/src/NfeAgendamento.Bridge/Security/LocalRequestGuard.cs` — validação Origin/Host.
- `apps/bridge/src/NfeAgendamento.Bridge/Certificates/CertificateService.cs` — descoberta/seleção local.
- `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/NfeLookupService.cs` — orquestra lookup sem retry inseguro.
- `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/INfeDistributionTransport.cs` — interface testável do transporte.
- `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/SefazDistributionTransport.cs` — transporte real reaproveitado/portado.
- `apps/bridge/src/NfeAgendamento.Bridge/Portal/IPortalFallbackService.cs` — contrato do fallback.
- `apps/bridge/src/NfeAgendamento.Bridge/Portal/PortalFallbackService.cs` — operações efêmeras.
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/*` — xUnit.

---

### Task 1: Bootstrap do repositório e CI

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `package.json`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/wrangler.jsonc`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.ts`
- Create: `apps/web/src/styles.css`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj`
- Create: `apps/bridge/NfeAgendamento.Bridge.slnx`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: site buildável por `npm run build:web` e Bridge buildável por `dotnet build apps/bridge/NfeAgendamento.Bridge.slnx -c Release`.

- [ ] **Step 1: criar teste smoke web**

Create `apps/web/tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('web bootstrap', () => {
  it('starts with the bridge endpoint fixed to loopback', async () => {
    const contracts = await import('../src/bridge/contracts');
    expect(contracts.BRIDGE_BASE_URL).toBe('http://127.0.0.1:17345/api/v1');
  });
});
```

Expected before implementation: FAIL because `src/bridge/contracts.ts` does not exist.

- [ ] **Step 2: criar estrutura mínima web e contratos**

`apps/web/src/bridge/contracts.ts` must export:

```ts
export const BRIDGE_BASE_URL = 'http://127.0.0.1:17345/api/v1' as const;
export type BridgeHealth = {
  version: string;
  status: 'ok';
  webView2Available: boolean;
  certificateSelected: boolean;
};
```

Create Vite/TypeScript config and a minimal `main.ts` that renders the application shell.

- [ ] **Step 3: criar smoke test do Bridge**

Create `apps/bridge/tests/NfeAgendamento.Bridge.Tests/CompositionTests.cs`:

```csharp
namespace NfeAgendamento.Bridge.Tests;

public sealed class CompositionTests
{
    [Fact]
    public void ApiPrefix_is_versioned()
    {
        Assert.Equal("/api/v1", BridgeConstants.ApiPrefix);
    }

    [Fact]
    public void ListenUrl_is_loopback_only()
    {
        Assert.Equal("http://127.0.0.1:17345", BridgeConstants.ListenUrl);
    }
}
```

Expected before implementation: FAIL because `BridgeConstants` does not exist.

- [ ] **Step 4: implementar constantes e host mínimo**

Create `BridgeConstants.cs`:

```csharp
namespace NfeAgendamento.Bridge;

public static class BridgeConstants
{
    public const string ApiPrefix = "/api/v1";
    public const string ListenUrl = "http://127.0.0.1:17345";
}
```

`Program.cs` must call `builder.WebHost.UseUrls(BridgeConstants.ListenUrl)` and expose `GET /api/v1/health`.

- [ ] **Step 5: configurar CI**

Workflow must run on `push` and `pull_request` to `main`:

```yaml
- run: npm install
- run: npm run test:web
- run: npm run build:web
- run: dotnet test apps/bridge/NfeAgendamento.Bridge.slnx -c Release
- run: dotnet build apps/bridge/NfeAgendamento.Bridge.slnx -c Release --no-restore
```

- [ ] **Step 6: verificar**

Run via GitHub Actions after commit. Expected: web tests/build and .NET tests/build all PASS.

- [ ] **Step 7: commit**

Commit message: `feat: iniciar site e bridge do NFe 2.0`.

---

### Task 2: Segurança local e detecção do Bridge

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Security/LocalRequestGuard.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/LocalRequestGuardTests.cs`
- Create: `apps/web/src/bridge/client.ts`
- Create: `apps/web/tests/bridge-client.test.ts`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- Produces: `BridgeClient.health(): Promise<BridgeHealth>`.
- Produces: `LocalRequestGuard.IsAllowedOrigin(string?)` and `IsAllowedHost(string?)`.

- [ ] **Step 1: testes RED de segurança**

```csharp
[Theory]
[InlineData("https://nfeagendamento.example", true)]
[InlineData("https://evil.example", false)]
[InlineData(null, false)]
public void Origin_is_allowlisted(string? origin, bool expected)
{
    var guard = new LocalRequestGuard(["https://nfeagendamento.example"]);
    Assert.Equal(expected, guard.IsAllowedOrigin(origin));
}

[Theory]
[InlineData("127.0.0.1:17345", true)]
[InlineData("localhost:17345", false)]
[InlineData("192.168.0.10:17345", false)]
public void Host_is_strict(string host, bool expected)
{
    var guard = new LocalRequestGuard(["https://nfeagendamento.example"]);
    Assert.Equal(expected, guard.IsAllowedHost(host));
}
```

- [ ] **Step 2: implementar guard mínimo**

The guard compares exact normalized origins and accepts only host `127.0.0.1:17345`.

- [ ] **Step 3: integrar middleware**

All `/api/v1/*` endpoints must reject unexpected Host. Browser-facing endpoints require allowed Origin except `OPTIONS`; health may allow the official Origin and configured development origins only. Configure CORS from `Bridge:AllowedOrigins` with no wildcard.

- [ ] **Step 4: teste RED do cliente web**

Mock `fetch` and assert URL `${BRIDGE_BASE_URL}/health`, method GET, and a finite timeout using `AbortController`.

- [ ] **Step 5: implementar `BridgeClient`**

```ts
export class BridgeClient {
  constructor(private readonly baseUrl = BRIDGE_BASE_URL) {}
  async health(signal?: AbortSignal): Promise<BridgeHealth> { /* validated JSON */ }
}
```

- [ ] **Step 6: integrar status na UI**

Show exactly three operational states: `Bridge conectado`, `Bridge não encontrado`, `Permissão de acesso local necessária`.

- [ ] **Step 7: verificar e commit**

Expected all CI checks PASS. Commit: `feat: proteger e detectar bridge local`.

---

### Task 3: Certificado A1 local

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Certificates/CertificateInfo.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Certificates/CertificateService.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/CertificateServiceTests.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Modify: `apps/web/src/bridge/contracts.ts`
- Modify: `apps/web/src/bridge/client.ts`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- Produces Bridge endpoints: `GET /api/v1/certificates`, `POST /api/v1/certificate/select`.
- Produces `CertificateService.ListUsable()` and `Select(string thumbprint)`.

- [ ] **Step 1: testes RED do filtro de certificados**

Certificate is usable only when it has private key, is inside validity window, and supports client authentication usage when EKU is present.

- [ ] **Step 2: implementar descoberta em `StoreName.My` / `StoreLocation.CurrentUser`**

Return only metadata: subject, issuer, notBefore, notAfter, thumbprint. Do not serialize certificate bytes or private key.

- [ ] **Step 3: persistência mínima**

Persist selected thumbprint in `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json` using atomic replace. Invalid/missing stored thumbprint yields no selection.

- [ ] **Step 4: endpoints e contratos web**

```ts
export type CertificateSummary = {
  subject: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  thumbprint: string;
};
```

- [ ] **Step 5: UI de seleção no site**

Selection occurs inside the site. Bridge has no permanent configuration window.

- [ ] **Step 6: verificar e commit**

Expected all CI checks PASS. Commit: `feat: selecionar certificado A1 pelo site`.

---

### Task 4: Lookup NF-e bruto pelo Bridge

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/AccessKey.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/LookupResult.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/INfeDistributionTransport.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/NfeLookupService.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/SefazDistributionTransport.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/AccessKeyTests.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupServiceTests.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Modify: `apps/web/src/bridge/contracts.ts`
- Modify: `apps/web/src/bridge/client.ts`

**Interfaces:**
- `Task<LookupResult> NfeLookupService.LookupAsync(string accessKey, CancellationToken cancellationToken)`.
- `Task<TransportResult> INfeDistributionTransport.LookupAsync(string accessKey, X509Certificate2 certificate, CancellationToken cancellationToken)`.
- Endpoint `POST /api/v1/nfe/lookup` accepts `{ "accessKey": "44 digits" }`.

- [ ] **Step 1: RED para chave**

Test 44 digits, rejection of non-digits/wrong length, and check digit validation using known valid sanitized fixtures from the previous repository.

- [ ] **Step 2: implementar `AccessKey.TryParse`**

Validation occurs in Bridge even if site already validated.

- [ ] **Step 3: RED para no-retry**

A transport returning 429/656 or throwing ambiguous `HttpRequestException` is called exactly once.

- [ ] **Step 4: implementar service**

Return normalized categories: `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable`, `technical_error`.

- [ ] **Step 5: portar transporte fiscal útil do repositório antigo**

Port only certificate-authenticated request/response mechanics needed for lookup. Do not port shared gate, cooldown, leader, queue, cache, Central or dispatch classes.

- [ ] **Step 6: endpoint**

Bridge returns raw XML only on success and never renders/changes fiscal XML.

- [ ] **Step 7: verificar e commit**

Expected all CI checks PASS. Commit: `feat: consultar NFe pelo bridge local`.

---

### Task 5: Pipeline XML integralmente no site

**Files:**
- Create: `apps/web/src/nfe/access-key.ts`
- Create: `apps/web/src/nfe/xml.ts`
- Create: `apps/web/tests/access-key.test.ts`
- Create: `apps/web/tests/xml.test.ts`
- Create: `apps/web/tests/fixtures/nfe-basic.xml`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- `validateAccessKey(value: string): AccessKeyValidation`.
- `parseNfeXml(xml: string, expectedAccessKey: string): ParsedNfe`.

- [ ] **Step 1: RED para chave no browser**

Mirror Bridge validation so malformed keys never reach local service.

- [ ] **Step 2: implementar validator**

No network calls in this module.

- [ ] **Step 3: RED para XML**

Tests must reject malformed XML, XML without `infNFe`, and XML whose `Id`/access key does not match the requested key.

- [ ] **Step 4: implementar parser DOM**

Extract issuer, recipient when present, totals, products, dates and protocol fields needed by DANFE. Keep original XML string unchanged.

- [ ] **Step 5: integrate lookup flow**

On `success`, site parses and validates before exposing download/render actions.

- [ ] **Step 6: verificar e commit**

Expected all CI checks PASS. Commit: `feat: processar XML integralmente no site`.

---

### Task 6: Portar Fernando Klein com regressão

**Files:**
- Read source: old repo `src/NfeAgendamento.App/wwwroot/product-mapping.js`
- Read tests: old repo `tests/js/product-mapping-regression.test.js`
- Read fixture: old repo `tests/Fixtures/fernando-klein-full.xml`
- Create: `apps/web/src/nfe/product-mapping.ts`
- Create: `apps/web/tests/product-mapping.test.ts`
- Create: `apps/web/tests/fixtures/fernando-klein-full.xml`

**Interfaces:**
- `resolveFernandoKleinProduct(input): ProductPresentation`.
- `summarizeFernandoKleinProducts(input): FernandoKleinSummary`.
- `validateFernandoKleinCatalog(): true`.

- [ ] **Step 1: portar primeiro os testes**

Preserve catalog cardinality, aliases, emitter matching and unknown-product behavior from current `main` of the old repo.

- [ ] **Step 2: verify RED**

Tests fail because module does not exist.

- [ ] **Step 3: port mapping behavior to TypeScript**

Preserve original fiscal `cProd` and XML. Mapping changes presentation only.

- [ ] **Step 4: integrate into parsed product presentation**

Apply after XML validation and before DANFE render.

- [ ] **Step 5: verificar e commit**

Expected exact regression parity. Commit: `feat: portar tratamento Fernando Klein`.

---

### Task 7: Portar DANFE e visual aprovado

**Files:**
- Read source: old repo `src/NfeAgendamento.App/wwwroot/danfe-compact.js`
- Read source: old repo `src/NfeAgendamento.App/wwwroot/danfe-compact.css`
- Read source: old repo `src/NfeAgendamento.App/wwwroot/styles.css`
- Read tests: old repo `tests/NfeAgendamento.App.Tests/DanfeStaticAssetsTests.cs`
- Create: `apps/web/src/danfe/render.ts`
- Create: `apps/web/src/danfe/styles.css`
- Create: `apps/web/tests/danfe.test.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/styles.css`

**Interfaces:**
- `renderDanfe(nfe: ParsedNfe): HTMLElement`.
- `attachDanfeZoom(container: HTMLElement): () => void`.

- [ ] **Step 1: portar requisitos para testes Vitest/DOM**

Assert item order/count, required fiscal blocks, no unnecessary transport block when absent, A4 print classes, and `Ctrl + wheel` zoom affecting only DANFE container.

- [ ] **Step 2: port renderer sem transporte**

Renderer consumes only `ParsedNfe` + presentation mapping.

- [ ] **Step 3: portar CSS aprovado**

Keep compact A4 behavior, legibility and print rules. Remove CSS related to old Central/batch/config infrastructure.

- [ ] **Step 4: integrar modal/preview**

Preview is focused on DANFE; XML download uses original XML; browser print handles PDF.

- [ ] **Step 5: verificar e commit**

Expected DANFE regressions PASS. Commit: `feat: portar DANFE aprovado para o site`.

---

### Task 8: Fallback Portal/WebView2

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PortalOperationStatus.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Portal/IPortalFallbackService.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PortalFallbackService.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Portal/WebView2PortalWindow.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PortalFallbackServiceTests.cs`
- Create: `apps/web/src/portal/fallback.ts`
- Create: `apps/web/tests/portal-fallback.test.ts`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Modify: `apps/web/src/main.ts`

**Interfaces:**
- `POST /api/v1/portal/start` -> `{ operationId }`.
- `GET /api/v1/portal/status/{operationId}` -> state + XML only on completed.
- `PortalFallbackController.start(accessKey)` / `waitForResult(operationId, signal)`.

- [ ] **Step 1: RED for operation isolation**

Unknown operation IDs return not found; operations are local/ephemeral; only fixed official Portal URL is used.

- [ ] **Step 2: RED for temp file safety**

Captured file must be XML, bounded in size, match requested access key, and be deleted after successful handoff/cancel.

- [ ] **Step 3: implement service independent of WebView2 UI**

Use an adapter interface so state machine is unit-testable without desktop UI.

- [ ] **Step 4: integrate WebView2**

Open dedicated official Portal window, prefill key only where stable, never automate captcha, capture download into controlled temp path.

- [ ] **Step 5: integrate site**

`consumption_limit` offers/starts fallback, polls state, then sends completed XML through the exact same `parseNfeXml` → Fernando Klein → DANFE pipeline.

- [ ] **Step 6: verificar e commit**

Expected unit regressions PASS. Physical Portal/captcha remains an explicit Windows acceptance test. Commit: `feat: adicionar fallback Portal pelo bridge`.

---

### Task 9: UX final, documentação e readiness

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `README.md`
- Create: `docs/testing/acceptance.md`
- Create: `docs/architecture/bridge-security.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- No new protocol; consolidates existing behavior.

- [ ] **Step 1: estados finais de UX**

Site clearly distinguishes bridge missing, local permission, certificate missing/expired, invalid key, fiscal status, limit, SEFAZ unavailable, Portal unavailable/cancelled and invalid XML.

- [ ] **Step 2: ensure removed architecture is absent**

Add static regression tests searching active code for forbidden product concepts: `pairing`, `leader`, `standby`, `shared queue`, `batch lookup`, LAN bind.

- [ ] **Step 3: physical acceptance guide**

Document Chrome/Edge/Firefox access-to-loopback permission test, A1 lookup, 656 fallback, captcha, XML return, DANFE/PDF and a second independent PC with its own Bridge.

- [ ] **Step 4: CI final**

Run all web tests/build and Bridge tests/build. Add Windows artifact build only when executable packaging is introduced; do not label a release ready before that workflow is green.

- [ ] **Step 5: update docs/context**

README states current completed capabilities and any physical validation still pending.

- [ ] **Step 6: final review**

Compare `main` against this spec and plan. Confirm no old Central architecture was copied accidentally.

- [ ] **Step 7: commit**

Commit: `docs: concluir readiness do NFe Agendamento 2.0`.

---

## Self-review

- Spec coverage: every included feature maps to Tasks 1–9; all excluded architecture concepts are explicitly blocked in Tasks 1/9.
- Security coverage: loopback bind, Origin/Host allowlist, request validation and no key-private exposure are in Tasks 2–4.
- Site ownership: XML, Fernando Klein and DANFE are exclusively in Tasks 5–7.
- Portal: isolated adapter/state machine and manual captcha are covered in Task 8.
- Testing: every functional task starts with RED tests and ends with CI verification.
- No release is claimed until automated CI is green and physical Windows acceptance items are recorded separately.
