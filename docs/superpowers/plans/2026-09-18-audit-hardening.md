# Hardening final pós-auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todos os achados da auditoria que podem ser resolvidos no repositório e transformar Authenticode/ruleset em gates externos explícitos.

**Architecture:** Preservar a arquitetura atual. As mudanças são hardening nas bordas: UI/lote, Worker, updater Windows, modal DANFE, CI e documentação.

**Tech Stack:** TypeScript/Vite/Vitest, Cloudflare Workers/Durable Objects/Rate Limiting/Cache API, .NET 10/WinForms, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-18-audit-hardening-design.md`

## Global Constraints

- Estado atual da `main` é a fonte de verdade.
- Nenhuma mudança de arquitetura central.
- Nenhum dado fiscal novo pode ser enviado ao Cloudflare.
- Nenhuma release nova deve ser publicada sem Authenticode válido.
- Mudanças comportamentais usam RED → GREEN.
- Documentação deve terminar sincronizada com a implementação.

## Task 1: Corrigir regressões de lote e consumo de memória

**Files:**
- Modify: `apps/web/src/batch/input.ts`
- Modify: `apps/web/src/batch/controller.ts`
- Modify: `apps/web/src/batch/zip.ts`
- Modify: `apps/web/src/batch.css`
- Modify: `apps/web/tests/batch-input.test.ts`
- Modify: `apps/web/tests/batch-controller.test.ts`
- Modify: `apps/web/tests/batch-zip.test.ts`
- Modify: `apps/web/tests/shell.test.ts`

- [ ] Escrever testes que exijam máximo de 100 chaves válidas, preservação do erro inicial do lote, elementos `hidden` não exibidos e ZIP sem buffer final monolítico/limite agregado.
- [ ] Confirmar RED no CI.
- [ ] Implementar o mínimo: `MAX_BATCH_ITEMS = 100`, estado final de erro explícito, regra CSS de `hidden`, Blob por partes e teto agregado.
- [ ] Confirmar GREEN.

## Task 2: Hardening do Worker

**Files:**
- Modify: `worker/fiscal-coordination-http.ts`
- Modify: `worker/update-proxy.ts`
- Modify: `worker/index.ts`
- Modify: `wrangler.jsonc`
- Modify: `apps/web/tests/fiscal-coordinator-worker.test.ts`
- Modify: `apps/web/tests/update-proxy-worker.test.ts`
- Modify: `apps/web/tests/deploy-config.test.ts`

- [ ] Escrever testes para chave de rate limit derivada do IP Cloudflare, limiter separado de update e cache de metadata.
- [ ] Confirmar RED.
- [ ] Implementar limiter por IP para coordenação, novo `UPDATE_RATE_LIMITER` e cache curto da metadata.
- [ ] Confirmar GREEN.

## Task 3: Updater e release exigem Authenticode

**Files:**
- Create: `apps/bridge/windows/NfeAgendamento.App/AuthenticodeVerifier.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.App/UpdateService.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.App/Program.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/UpdateServiceTests.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/TrayUpdaterStaticTests.cs`
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/WorkflowHardeningStaticTests.cs`

- [ ] Escrever testes que exijam verificação de assinatura depois do SHA-256 e bloqueio de release commit sem assinatura válida.
- [ ] Confirmar RED.
- [ ] Implementar WinVerifyTrust e injeção de verificador no `UpdateService`.
- [ ] Adicionar gate Authenticode no job `windows-package` para commits `release: v*`.
- [ ] Confirmar GREEN.

## Task 4: Acessibilidade do viewer DANFE

**Files:**
- Modify: `apps/web/src/danfe/viewer.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/tests/danfe-viewer.test.ts`

- [ ] Escrever testes de Tab/Shift+Tab e restauração do foco.
- [ ] Confirmar RED.
- [ ] Implementar focus trap e retorno ao foco anterior.
- [ ] Confirmar GREEN.

## Task 5: Supply chain e documentação

**Files:**
- Modify: `.github/workflows/codeql.yml`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/WorkflowHardeningStaticTests.cs`
- Modify: `docs/testing/acceptance.md`
- Modify: `docs/testing/batch-query.md`
- Modify: `docs/testing/bridge-updater.md`
- Modify: `docs/architecture/fiscal-usage-guard.md`
- Modify: `docs/operations/repository-hardening.md`
- Modify: `docs/ui/consultation-screen.md`
- Modify: `README.md`

- [ ] Pin CodeQL v4 pelo commit atual `1c5b675653bb5c22dbe9b12b556ec555138e09fd`.
- [ ] Atualizar docs para v0.0.16, teto 100, limiter por IP, cache de update e gate Authenticode.
- [ ] Manter ruleset da `main` como pendência externa explícita.
- [ ] Rodar busca final por referências canônicas obsoletas `0.0.14`.

## Task 6: Verificação final

- [ ] Confirmar CI `web`, `bridge`, `fiscal-compatibility`, `danfe-print`, `windows-package` no HEAD final.
- [ ] Confirmar CodeQL no HEAD final.
- [ ] Revisar diff entre o SHA inicial `e9c2e6d7287f4495e55106306eacf72867049ec6` e HEAD.
- [ ] Não declarar Authenticode externo nem ruleset administrativo como concluídos sem evidência real.
