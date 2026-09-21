# Site-first Fiscal Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o site a única UX do NFe Agendamento, reduzir o Windows a um agente fiscal local mínimo e manter o helper Portal apenas como componente técnico excepcional, sem regressão fiscal.

**Architecture:** Evolução incremental da v0.0.17. O site ganha capabilities, diagnóstico, update e prewarm; o Bridge mantém A1/SEFAZ/proteção fiscal e ganha idempotência; o helper WebView2 continua isolado. O App de bandeja é retirado somente depois de startup, update, crash behavior e rollback equivalentes.

**Tech Stack:** Vite 8 + TypeScript + Vitest, Cloudflare Workers, .NET 10/ASP.NET Core, xUnit, WinForms/WebView2, Named Pipes, Inno Setup, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-21-site-first-fiscal-agent-design.md`

## Global Constraints

- Baseline de produção: v0.0.17.
- Não alterar transporte `NFeDistribuicaoDFe` durante as fases de UX/lifecycle.
- Não remover `FiscalUsageGuard` nem coordenação multi-PC.
- Não criar retry fiscal automático.
- A1 permanece em `CurrentUser/My`; PFX, senha e chave privada nunca saem do Windows.
- Bridge continua em `127.0.0.1:17345`, sem LAN/mDNS.
- Origin/CORS continuam fail-closed e sem wildcard.
- hCaptcha continua manual.
- XML continua limitado a 10 MiB, DTD proibido e associado à chave consultada.
- Regras locais de fornecedor permanecem locais.
- App não é removido na mesma release em que o Bridge standalone estreia como autostart.
- Contratos `/portal/start|status|cancel` permanecem durante toda a transição.
- Persistência em `%LOCALAPPDATA%\NfeAgendamentoBridge` deve ser preservada.
- Cada task deve terminar com testes verdes e commit isolado.

## Review Focus

1. **Site novo com Bridge v0.0.17:** capabilities ausentes devem degradar com segurança, sem bloquear consulta.
2. **Prewarm falha:** consulta direta e fallback cold-start precisam continuar funcionando.
3. **Duplo clique/timeout HTTP:** não pode gerar duas tentativas SEFAZ para a mesma operação.
4. **Bridge standalone cai:** o site deve diagnosticar claramente a indisponibilidade; a retirada do App só avança com evidência aceitável.
5. **Upgrade de instalação antiga:** settings, fiscal-usage e supplier-rules não podem ser apagados.

---

### Task 1: Capabilities aditivas e compatibilidade com Bridge antigo

**Files:**
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Modify: `apps/web/src/bridge/contracts.ts`
- Modify: `apps/web/src/bridge/client.ts`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/CertificateEndpointsIntegrationTests.cs`
- Create: `apps/web/tests/bridge-health.test.ts`
- Modify: `docs/architecture/bridge-security.md`

**Interfaces:**
- Consumes: `GET /api/v1/health` atual.
- Produces: `BridgeHealth.capabilities?: BridgeCapabilities`, mantendo campos atuais.
- Produces no Bridge novo:
  `directLookup=true`, `portalFallback=true`, `portalPrewarm=true`, `manualXmlImport=true`.

- [ ] **Step 1: escrever teste web para aceitar health antigo e novo**

```ts
const legacy = {
  version: '0.0.17',
  status: 'ok',
  webView2Available: true,
  certificateSelected: true,
};

const current = {
  ...legacy,
  capabilities: {
    directLookup: true,
    portalFallback: true,
    portalPrewarm: true,
    manualXmlImport: true,
  },
};
```

O teste deve provar que ambos são aceitos e que capability malformada é rejeitada.

- [ ] **Step 2: executar teste e confirmar RED**

Run:
```bash
npm run test:web -- --run apps/web/tests/bridge-health.test.ts
```

Expected: FAIL porque `BridgeCapabilities` ainda não existe.

- [ ] **Step 3: adicionar tipos aditivos**

```ts
export type BridgeCapabilities = {
  directLookup: boolean;
  portalFallback: boolean;
  portalPrewarm: boolean;
  manualXmlImport: boolean;
};

export type BridgeHealth = {
  version: string;
  status: 'ok';
  webView2Available: boolean;
  certificateSelected: boolean;
  capabilities?: BridgeCapabilities;
};
```

`isBridgeHealth` deve:
- validar os quatro campos existentes;
- aceitar ausência de `capabilities`;
- quando presente, validar os quatro booleanos.

- [ ] **Step 4: expor capabilities no health do Bridge**

Adicionar ao payload atual:

```csharp
capabilities = new
{
    directLookup = true,
    portalFallback = true,
    portalPrewarm = true,
    manualXmlImport = true,
},
```

- [ ] **Step 5: fixar contrato em integração .NET**

No teste existente de health, validar:

```csharp
var capabilities = health.GetProperty("capabilities");
Assert.True(capabilities.GetProperty("directLookup").GetBoolean());
Assert.True(capabilities.GetProperty("portalFallback").GetBoolean());
Assert.True(capabilities.GetProperty("portalPrewarm").GetBoolean());
Assert.True(capabilities.GetProperty("manualXmlImport").GetBoolean());
```

- [ ] **Step 6: rodar testes**

```bash
npm run test:web -- --run apps/web/tests/bridge-health.test.ts
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
```

Expected: PASS.

- [ ] **Step 7: documentar compatibilidade**

Registrar em `bridge-security.md` que capabilities são aditivas e clientes novos não podem exigir o campo para falar com v0.0.17.

- [ ] **Step 8: commit**

```bash
git add apps/bridge/src/NfeAgendamento.Bridge/Program.cs apps/web/src/bridge/contracts.ts apps/web/src/bridge/client.ts apps/bridge/tests/NfeAgendamento.Bridge.Tests/CertificateEndpointsIntegrationTests.cs apps/web/tests/bridge-health.test.ts docs/architecture/bridge-security.md
git commit -m "feat: add bridge capability discovery"
```

---

### Task 2: Diagnóstico site-first e atualização percebida no site

**Files:**
- Create: `apps/web/src/update/windows-update.ts`
- Create: `apps/web/tests/windows-update.test.ts`
- Modify: `apps/web/src/settings-panel.ts`
- Modify: `apps/web/src/settings-panel.css`
- Modify: `apps/web/tests/settings-panel.test.ts`
- Modify: `docs/ui/consultation-screen.md`
- Modify: `docs/testing/bridge-updater.md`

**Interfaces:**
- Consumes: `BridgeHealth.version`.
- Consumes: `GET /api/update/latest`.
- Produces: `checkWindowsUpdate(currentVersion, fetchFn)`.
- Produces estados de diagnóstico:
  `ok | not_running | local_access_denied | incompatible | unknown`.

- [ ] **Step 1: escrever parser/testes da metadata**

Criar contrato mínimo:

```ts
export type WindowsUpdate = {
  latestVersion: string;
  downloadUrl: string;
  size: number;
  digest: string;
};

export async function checkWindowsUpdate(
  currentVersion: string,
  fetchFn: typeof fetch = fetch,
): Promise<WindowsUpdate | null>;
```

Testar:
- mesma versão → `null`;
- versão mais nova → objeto válido;
- prerelease/draft → erro;
- nome de asset inesperado → erro;
- URL fora de `/downloads/windows/` → erro;
- digest sem `sha256:` → erro.

- [ ] **Step 2: executar RED**

```bash
npm run test:web -- --run apps/web/tests/windows-update.test.ts
```

- [ ] **Step 3: implementar parser sem dependência nova**

Comparar versão `major.minor.patch` numericamente e aceitar somente o shape já entregue por `worker/update-proxy.ts`.

- [ ] **Step 4: mover o conceito de update para o painel do site**

No diagnóstico, depois de health saudável:

```ts
const update = await checkWindowsUpdate(health.version);
if (update) {
  updateAction.hidden = false;
  updateAction.href = update.downloadUrl;
  updateAction.textContent = `Atualizar componente Windows para ${update.latestVersion}`;
}
```

Manter o link fixo atual de download como recuperação/instalação limpa até a retirada do App.

- [ ] **Step 5: classificar erro de integração local**

Adicionar função pura:

```ts
export function classifyBridgeFailure(error: unknown): BridgeDiagnosticState
```

Regras:
- resposta HTTP conhecida 403 → `local_access_denied`;
- timeout/refused → `not_running`;
- resposta health válida porém capability/versão incompatível → `incompatible`;
- demais → `unknown`.

Não prometer distinguir política do navegador quando o runtime não fornece evidência suficiente; nesse caso usar `unknown` com instrução de verificação local.

- [ ] **Step 6: atualizar testes estáticos do painel**

Fixar textos:
- “Componente local conectado”;
- “Atualização disponível”;
- “Permissão de rede local” somente no estado correspondente;
- nenhuma chave fiscal exposta.

- [ ] **Step 7: rodar testes web**

```bash
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
```

- [ ] **Step 8: commit**

```bash
git add apps/web/src/update apps/web/src/settings-panel.ts apps/web/src/settings-panel.css apps/web/tests docs/ui/consultation-screen.md docs/testing/bridge-updater.md
git commit -m "feat: move local diagnostics and update UX to site"
```

---

### Task 3: Prewarm seguro do Portal/WebView2

**Files:**
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PortalContracts.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PersistentPortalClient.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Portal/ProcessPortalWindowLauncher.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Modify: `apps/web/src/bridge/client.ts`
- Modify: `apps/web/src/portal/fallback.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PersistentPortalClientTests.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/ProcessPortalWindowLauncherTests.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PortalEndpointsIntegrationTests.cs`
- Modify: `apps/web/tests/portal-fallback.test.ts`
- Modify: `docs/testing/portal-post-hcaptcha.md`

**Interfaces:**
- Produces: `IPortalWarmup.WarmUpAsync(CancellationToken)`.
- Produces: `POST /api/v1/portal/prewarm -> { state: "ready" | "unavailable" }`.
- Produces: `BridgeClient.prewarmPortal()`.
- Prewarm é best-effort.

- [ ] **Step 1: escrever teste do cliente persistente**

Teste novo:

```csharp
[Fact]
public async Task Warmup_creates_one_session_without_starting_an_operation()
{
    var session = new ScriptedSession();
    var creates = 0;
    var client = new PersistentPortalClient(_ =>
    {
        creates++;
        return Task.FromResult<IPortalIpcSession>(session);
    });

    Assert.True(await client.WarmUpAsync(TestContext.Current.CancellationToken));
    Assert.True(await client.WarmUpAsync(TestContext.Current.CancellationToken));
    Assert.Equal(1, creates);
    Assert.Empty(session.Sent);
}
```

- [ ] **Step 2: executar RED**

```bash
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
```

- [ ] **Step 3: implementar WarmUpAsync**

Adicionar em `PersistentPortalClient` método que:
- respeita cooldown;
- chama `GetOrCreateSessionAsync`;
- não altera `_busy`;
- em falha entra em cooldown, reseta sessão e retorna `false`;
- nunca envia `StartOperation`.

- [ ] **Step 4: criar interface separada**

```csharp
public interface IPortalWarmup
{
    Task<bool> WarmUpAsync(CancellationToken cancellationToken);
}
```

`ProcessPortalWindowLauncher : IPortalWindowLauncher, IPortalWarmup, IAsyncDisposable`.

Registrar uma única instância:

```csharp
builder.Services.AddSingleton<ProcessPortalWindowLauncher>();
builder.Services.AddSingleton<IPortalWindowLauncher>(sp =>
    sp.GetRequiredService<ProcessPortalWindowLauncher>());
builder.Services.AddSingleton<IPortalWarmup>(sp =>
    sp.GetRequiredService<ProcessPortalWindowLauncher>());
```

- [ ] **Step 5: criar endpoint best-effort**

```csharp
api.MapPost("/portal/prewarm", async (
    IPortalWarmup portal,
    CancellationToken cancellationToken) =>
{
    var ready = await portal.WarmUpAsync(cancellationToken);
    return Results.Ok(new { state = ready ? "ready" : "unavailable" });
});
```

Prewarm não pode retornar 500 por runtime ausente.

- [ ] **Step 6: implementar cliente web**

```ts
async prewarmPortal(signal?: AbortSignal): Promise<'ready' | 'unavailable'>
```

- [ ] **Step 7: disparar uma vez após health compatível**

O site chama prewarm somente se:
- health OK;
- `webView2Available`;
- `health.capabilities?.portalPrewarm === true`.

Falha é ignorada para o fluxo principal.

- [ ] **Step 8: testar que fallback continua cold-start**

Teste web deve simular `prewarmPortal` rejeitando e depois provar que `startPortal` ainda é chamado normalmente quando necessário.

- [ ] **Step 9: rodar suites**

```bash
npm run test:web
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
```

- [ ] **Step 10: commit**

```bash
git add apps/bridge/src/NfeAgendamento.Bridge/Portal apps/bridge/src/NfeAgendamento.Bridge/Program.cs apps/bridge/tests/NfeAgendamento.Bridge.Tests apps/web/src apps/web/tests docs/testing/portal-post-hcaptcha.md
git commit -m "perf: prewarm portal helper from site"
```

---

### Task 4: Fallback manual de XML apenas como contingência

**Files:**
- Create: `apps/web/src/nfe/manual-xml-import.ts`
- Create: `apps/web/tests/manual-xml-import.test.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `docs/testing/portal-post-hcaptcha.md`

**Interfaces:**
- Produces: `validateManualNfeXml(file, expectedAccessKey)`.
- Consumes o parser XML existente.
- Não substitui helper como padrão.

- [ ] **Step 1: testes RED**

Cobrir:
- XML válido da chave esperada;
- chave divergente;
- arquivo vazio;
- arquivo > 10 MiB;
- extensão não XML;
- cancelamento do seletor.

- [ ] **Step 2: implementar validação no browser**

Limite:

```ts
const MAX_XML_BYTES = 10 * 1024 * 1024;
```

Ler `file.text()`, usar `parseNfeXml` e exigir `parsed.accessKey === expectedAccessKey`.

- [ ] **Step 3: expor ação somente após falha terminal do helper**

Texto: “Importar XML baixado manualmente”.

Não abrir automaticamente o Portal normal nesta task; a ação é recuperação.

- [ ] **Step 4: rodar web**

```bash
npm run lint:web
npm run test:web
npm run build:web
```

- [ ] **Step 5: commit**

```bash
git add apps/web/src/nfe/manual-xml-import.ts apps/web/tests/manual-xml-import.test.ts apps/web/src/main.ts apps/web/src/styles.css docs/testing/portal-post-hcaptcha.md
git commit -m "feat: add manual xml recovery fallback"
```

---

### Task 5: Idempotência fiscal e coalescência de lookup

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/NfeLookupOperationRegistry.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupOperationRegistryTests.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Modify: `apps/web/src/bridge/client.ts`
- Modify: `apps/web/src/nfe/consultation-controller.ts`
- Modify: `apps/web/src/batch/controller.ts`
- Modify: corresponding controller tests
- Modify: `docs/architecture/fiscal-usage-guard.md`

**Interfaces:**
- Evolui request para `{ accessKey, requestId? }`.
- Produces:
  `Task<LookupResult> ExecuteAsync(string requestId, string accessKey, Func<Task<LookupResult>> factory)`.
- TTL terminal: 2 min.
- Máximo: 256 entradas.
- Clientes antigos sem `requestId` continuam aceitos.

- [ ] **Step 1: testes RED do registry**

Fixar:
- mesmo requestId + mesma chave → factory executa uma vez;
- requestId igual + chave diferente → conflito;
- mesma chave em voo com requestIds diferentes → uma execução;
- depois do TTL uma ação nova pode executar;
- registry nunca executa duas factories simultâneas para a mesma chave.

- [ ] **Step 2: implementar registry sem tocar no transporte**

O registry envolve a chamada a `NfeLookupService.LookupAsync`; não modifica `NfeLookupService`, `FiscalUsageGuard` ou `SefazDistributionTransport`.

- [ ] **Step 3: evoluir request record**

```csharp
public sealed record NfeLookupRequest(string AccessKey, string? RequestId);
```

Regras:
- ausente → comportamento legado;
- presente → UUID válido;
- requestId conflitante → HTTP 409 `request_id_conflict`.

- [ ] **Step 4: site gera requestId estável por operação**

`BridgeClient.lookupNfe` recebe o id gerado pelo controller:

```ts
const requestId = crypto.randomUUID();
await bridge.lookupNfe(accessKey, signal, requestId);
```

O mesmo id precisa ser reutilizado por qualquer repetição de transporte da mesma operação; esta migração não adiciona retry automático.

- [ ] **Step 5: provar ausência de dupla tentativa**

Usar fake transport contador no teste .NET e disparar duas requisições concorrentes equivalentes. Esperado: contador `1`.

- [ ] **Step 6: rodar suites fiscal/web**

```bash
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
npm run test:web
```

- [ ] **Step 7: commit**

```bash
git add apps/bridge/src/NfeAgendamento.Bridge apps/bridge/tests/NfeAgendamento.Bridge.Tests apps/web/src apps/web/tests docs/architecture/fiscal-usage-guard.md
git commit -m "feat: make fiscal lookups idempotent"
```

---

### Task 6: Piloto de Bridge standalone sem retirar o App

**Files:**
- Modify: `apps/bridge/installer/NfeAgendamentoBridge.iss`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/StandaloneLifecycleStaticTests.cs`
- Modify: `docs/architecture/bridge-security.md`
- Create: `docs/testing/standalone-bridge.md`

**Interfaces:**
- Consumes comportamento já existente: Bridge sem `--managed` não expira por lease.
- Produces modo de instalação de transição controlado por define do Inno Setup:
  `BridgeAutostartMode=app|standalone`.
- Default desta task continua `app`.

- [ ] **Step 1: fixar testes do modo atual**

Teste deve provar:
- default ainda inicia `NfeAgendamento.App.exe`;
- define `standalone` gera HKCU Run para `NfeAgendamento.Bridge.exe`;
- nunca registra ambos;
- nenhum admin/service/scheduled task.

- [ ] **Step 2: implementar define no installer**

Exemplo:

```iss
#ifndef BridgeAutostartMode
  #define BridgeAutostartMode "app"
#endif
```

As seções `[Registry]` e `[Run]` escolhem exatamente um executável.

- [ ] **Step 3: preservar App no pacote**

Mesmo em piloto standalone, continuar publicando `NfeAgendamento.App.exe` para rollback. Não remover projeto nem CI.

- [ ] **Step 4: documentar checklist standalone**

Validar:
- logon;
- Bridge health;
- logout/login;
- reboot;
- segunda instância;
- Portal;
- update por Setup;
- processo encerrado manualmente e diagnóstico do site.

- [ ] **Step 5: rodar Bridge tests**

```bash
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
```

- [ ] **Step 6: commit**

```bash
git add apps/bridge/installer/NfeAgendamentoBridge.iss apps/bridge/tests/NfeAgendamento.Bridge.Tests docs/architecture/bridge-security.md docs/testing/standalone-bridge.md
git commit -m "feat: prepare standalone bridge autostart pilot"
```

---

### Task 7: Retirar a UX do App, mantendo supervisor como rollback

**Files:**
- Modify: `apps/bridge/windows/NfeAgendamento.App/Program.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/TrayUpdaterStaticTests.cs`
- Modify: `docs/testing/bridge-updater.md`
- Modify: `docs/ui/consultation-screen.md`

**Interfaces:**
- App deixa de ser interface primária.
- Site passa a ser caminho oficial para abrir, diagnosticar e atualizar.
- Nesta task o App ainda pode supervisionar Bridge em instalações `app`.

- [ ] **Step 1: mudar testes antes do código**

Substituir expectativa de menu de update por expectativa de modo headless/transitório:
- sem “Abrir NFe Agendamento”;
- sem “Verificar atualizações”;
- sem double-click abrindo site;
- mantém `BridgeControlClient`, heartbeat, restart policy e shutdown.

- [ ] **Step 2: remover UX paralela do App**

Manter `NotifyIcon.Visible = false` no modo de supervisor de transição, sem menus.

O App não deve abrir o site automaticamente.

- [ ] **Step 3: manter updater somente se necessário para rollback da release de transição**

Se ainda empacotado, não expor UI; a atualização oficial já está no site. Remoção física de `UpdateService.cs` fica para a task final.

- [ ] **Step 4: rodar testes**

```bash
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
```

- [ ] **Step 5: commit**

```bash
git add apps/bridge/windows/NfeAgendamento.App/Program.cs apps/bridge/tests/NfeAgendamento.Bridge.Tests/TrayUpdaterStaticTests.cs docs/testing/bridge-updater.md docs/ui/consultation-screen.md
git commit -m "refactor: make windows supervisor headless"
```

---

### Task 8: Gate de aposentadoria do App

**Files:**
- Modify only after gate passes:
  - `apps/bridge/installer/NfeAgendamentoBridge.iss`
  - `.github/workflows/ci.yml`
  - `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs`
  - `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj`
  - `docs/architecture/bridge-security.md`
  - `docs/testing/acceptance.md`
- Delete only after one stable transition release:
  - `apps/bridge/windows/NfeAgendamento.App/*`
  - App-only updater/control-client tests no longer used elsewhere.

**Interfaces:**
- Autostart oficial vira `NfeAgendamento.Bridge.exe` standalone.
- Portal helper continua filho do Bridge.
- Setup continua por usuário.

- [ ] **Step 1: verificar gate antes de editar**

Todos precisam ser verdadeiros:
- site cobre diagnóstico/update;
- prewarm pode falhar sem quebrar fallback;
- Bridge standalone inicia no logon;
- mutex impede segunda instância;
- settings persistem;
- Portal funciona com Bridge standalone;
- CI completo verde;
- uma release de transição preservou rollback;
- não há evidência de crash que torne supervisor necessário.

Se qualquer item falhar: **parar aqui e manter App headless**.

- [ ] **Step 2: mudar testes do instalador para standalone**

Esperar:
```text
HKCU Run -> NfeAgendamento.Bridge.exe
[Run] -> NfeAgendamento.Bridge.exe
```

E proibir:
```text
NfeAgendamento.App.exe
--managed
```
no instalador final.

- [ ] **Step 3: alterar installer**

Remover autostart e shortcut do App. Preservar diretório e dados.

- [ ] **Step 4: retirar App do empacotamento CI**

Remover apenas o publish do projeto App; manter Bridge + Portal self-contained.

- [ ] **Step 5: remover código morto**

Somente agora remover App/updater e o protocolo de lease se nenhuma outra parte depender dele.

O mutex de instância única do Bridge permanece.

- [ ] **Step 6: rodar CI local aplicável**

```bash
npm ci
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
./node_modules/.bin/wrangler deploy --dry-run
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release --no-restore
npm ci --prefix tests/playwright
npm test --prefix tests/playwright
```

- [ ] **Step 7: commit**

```bash
git add -A
git commit -m "refactor: retire windows tray app"
```

---

### Task 9: Release de migração e documentação final

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/bridge-security.md`
- Modify: `docs/architecture/frontend-boundaries.md`
- Modify: `docs/testing/acceptance.md`
- Modify: `docs/testing/portal-post-hcaptcha.md`
- Modify: `docs/testing/bridge-updater.md`
- Create: `docs/releases/v<release>.md`
- Modify: `Directory.Build.props` somente quando a implementação estiver pronta para release.

**Interfaces:**
- README continua descrevendo apenas arquitetura realmente implementada.
- Release documenta migração/rollback.

- [ ] **Step 1: revisar documentação contra código**

Não escrever no README que App foi retirado enquanto ele ainda for necessário.

- [ ] **Step 2: registrar upgrade**

Documentar:
- v0.0.17 → release de transição;
- preservação de settings;
- comportamento do site com Bridge antigo;
- como retornar ao instalador anterior se o standalone falhar.

- [ ] **Step 3: executar gates completos**

Mesmos comandos da Task 8 e status verde no CI remoto.

- [ ] **Step 4: atualizar versão/release**

Seguir o fluxo canônico existente do repositório. Não publicar tag antes do CI completo do SHA final.

- [ ] **Step 5: commit de release**

```bash
git add Directory.Build.props README.md docs
git commit -m "release: v<release>"
```

## Ordem de execução obrigatória

```text
Task 1 capabilities
  ↓
Task 2 site-first diagnóstico/update
  ↓
Task 3 Portal prewarm
  ↓
Task 4 contingência XML manual
  ↓
Task 5 idempotência fiscal
  ↓
Task 6 piloto standalone
  ↓
Task 7 App headless
  ↓
GATE DE ESTABILIDADE
  ↓
Task 8 aposentar App — somente se gate passar
  ↓
Task 9 release/docs
```

## Estratégia de releases

Não colocar toda a migração em uma única release.

**Release A — site-first seguro**
- Tasks 1–5.
- App continua exatamente como supervisor.
- Maior ganho de UX/latência com rollback simples.

**Release B — transição de lifecycle**
- Tasks 6–7.
- Bridge standalone disponível para piloto.
- App continua empacotado.

**Release C — simplificação final**
- Task 8 somente após evidência da Release B.
- App sai do pacote se o gate passar.
- Se o gate não passar, Release C mantém supervisor headless; não forçar remoção.

## Definition of Done

- Site é a única interface normal.
- A1/SEFAZ/proteção fiscal continuam locais e equivalentes.
- Portal helper aparece somente para interação humana.
- Primeiro fallback não paga todo o cold-start quando prewarm estiver disponível.
- Site novo funciona com Bridge v0.0.17.
- Duplo clique/repetição de transporte não duplica tentativa fiscal.
- Update é apresentado pelo site.
- Bridge standalone tem caminho de rollback comprovado.
- App só é removido se não reduzir confiabilidade.
- README e documentação descrevem o estado real, não o estado desejado.
