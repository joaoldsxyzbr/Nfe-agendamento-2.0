# Project Hardening Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concluir os pontos remanescentes da revisão geral sem alterar a arquitetura funcional do NFe Agendamento.

**Architecture:** Manter site estático + App WinForms + Bridge loopback + helper Portal persistente. As mudanças ficam restritas a lifecycle, cancelamento cooperativo, versionamento/release reproduzível e hardening do frontend/deploy.

**Tech Stack:** TypeScript/Vite/Vitest, .NET 10/WinForms/ASP.NET Core, Inno Setup, GitHub Actions, Cloudflare Workers.

**Spec:** revisão geral aprovada pelo usuário em 2026-09-09 e `docs/superpowers/specs/2026-09-09-persistent-portal-fallback-design.md` para invariantes do Portal.

## Global Constraints

- Trabalhar diretamente na `main`, conforme instrução permanente do projeto.
- Não alterar consulta fiscal, parser XML, DANFE, tratamento Fernando Klein ou updater além do necessário ao lifecycle.
- Portal continua exclusivo de `consumption_limit`; hCaptcha continua manual.
- Bridge continua restrito a loopback e origem oficial.
- Atualizar documentação/contexto e executar CI completo antes de considerar concluído.

---

### Task 1: Cancelamento do Portal ao abandonar a página

**Files:**
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/tests/portal-integration.test.ts`

**Interfaces:**
- Consumes: `PortalFallbackController.cancel(operationId)`.
- Produces: cancelamento best-effort ao abortar/recarregar/fechar uma operação Portal ainda ativa.

- [ ] **Step 1: RED** — adicionar teste estático/integração exigindo `activePortalOperationId`, listener de `pagehide` e chamada a `portalFallback.cancel(...)`.
- [ ] **Step 2: Run RED** — `npm run test:web`; esperado FAIL porque `main.ts` ainda não liga lifecycle da página ao cancelamento.
- [ ] **Step 3: GREEN** — guardar o operationId somente durante fallback ativo, limpar em terminal e disparar cancelamento best-effort em `pagehide`.
- [ ] **Step 4: Run GREEN** — `npm run test:web && npm run build:web`.
- [ ] **Step 5: Commit** — `fix: cancelar Portal ao abandonar pagina`.

### Task 2: Lifecycle correto do Bridge no tray

**Files:**
- Modify: `apps/bridge/windows/NfeAgendamento.App/Program.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/TrayUpdaterStaticTests.cs`

**Interfaces:**
- Produces: o App só encerra o processo Bridge que ele próprio iniciou; monitora `_bridgeProcess.HasExited` por timer e atualiza o tooltip para `Bridge indisponível` quando necessário.

- [ ] **Step 1: RED** — teste deve proibir `Process.GetProcessesByName` e exigir monitoramento via `System.Windows.Forms.Timer`/`HasExited`.
- [ ] **Step 2: Run RED** — bridge test project; esperado FAIL no código atual.
- [ ] **Step 3: GREEN** — remover `StopExistingBridgeProcesses`, iniciar apenas o child local, manter timer de saúde do processo, parar/dispor timer no shutdown e matar somente `_bridgeProcess` se ainda estiver vivo.
- [ ] **Step 4: Run GREEN** — bridge tests + build App.
- [ ] **Step 5: Commit** — `fix: tornar lifecycle do Bridge pertencente ao tray`.

### Task 3: Versionamento único e release única

**Files:**
- Create: `Directory.Build.props`
- Modify: três `.csproj` do Bridge/App/Portal
- Modify: `apps/bridge/installer/NfeAgendamentoBridge.iss`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Delete: `.github/workflows/release-v0.0.1.yml` ... `release-v0.0.6.yml`
- Add/modify tests estáticos de release/versionamento no projeto de testes Bridge.

**Interfaces:**
- `Directory.Build.props` define `<Version>0.0.6</Version>`, `<FileVersion>$(Version).0</FileVersion>` e `<AssemblyVersion>$(Version).0</AssemblyVersion>`.
- CI extrai `APP_VERSION` de `Directory.Build.props`, passa `/DMyAppVersion=$env:APP_VERSION` ao Inno Setup e nomeia artifacts dinamicamente.
- `release.yml` reage a CI verde cujo commit tenha subject `release: vX.Y.Z`, lê a versão canônica, exige igualdade exata e publica artifacts/notas `docs/releases/vX.Y.Z.md`.

- [ ] **Step 1: RED** — teste exige ausência de versões nos csproj/ISS e ausência de workflows históricos.
- [ ] **Step 2: Run RED** — bridge tests; esperado FAIL.
- [ ] **Step 3: GREEN** — centralizar props, parametrizar CI/ISS, criar workflow único e remover históricos.
- [ ] **Step 4: Run GREEN** — bridge tests e validação YAML indireta pelo CI.
- [ ] **Step 5: Commit** — `build: centralizar versao e workflow de release`.

### Task 4: Instalação reproduzível e hardening web

**Files:**
- Create: `package-lock.json` pelo npm compatível com Node 24/npm 11.
- Modify: `.github/workflows/ci.yml` para `npm ci`.
- Create: `apps/web/public/_headers` e garantir cópia pelo Vite.
- Modify: `apps/web/tests/deploy-config.test.ts`.
- Modify: `apps/web/src/main.ts` para remover menção antecipada ao Portal no texto normal.

**Interfaces:**
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:17345; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`.
- Outros headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

- [ ] **Step 1: RED** — teste exige `_headers`, CSP e texto inicial sem `Portal`.
- [ ] **Step 2: Run RED** — web tests; esperado FAIL.
- [ ] **Step 3: GREEN** — adicionar headers, ajustar copy e trocar `npm install` por `npm ci` após commitar lockfile real.
- [ ] **Step 4: Run GREEN** — `npm ci`, web tests/build e Wrangler dry-run.
- [ ] **Step 5: Commit** — `chore: tornar build web reproduzivel e endurecer headers`.

### Task 5: Documentação e verificação final

**Files:**
- Modify: `README.md`
- Modify: `docs/testing/acceptance.md`
- Create/update: documentação de release/lifecycle conforme estado atual.

- [ ] **Step 1:** documentar retenção/cancelamento Portal, ownership do Bridge, versão canônica, release única, `npm ci` e CSP.
- [ ] **Step 2:** verificar que Authenticode e branch protection continuam externos ao código e não foram simulados.
- [ ] **Step 3:** executar CI completo no SHA final e exigir `web`, `bridge` e `windows-package` verdes.
- [ ] **Step 4:** revisar diff final contra o escopo e confirmar ausência de mudanças fiscais/DANFE não solicitadas.
- [ ] **Step 5:** commit final de documentação se necessário.
