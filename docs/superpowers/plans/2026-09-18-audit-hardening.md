# Hardening final pós-auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todos os achados da auditoria que podem ser resolvidos no repositório. Authenticode e ruleset/branch protection são opcionais por decisão posterior aprovada em 18/09/2026.

**Architecture:** Preservar a arquitetura atual. As mudanças são hardening nas bordas: UI/lote, Worker, updater Windows, modal DANFE, CI e documentação.

**Tech Stack:** TypeScript/Vite/Vitest, Cloudflare Workers/Durable Objects/Rate Limiting/Cache API, .NET 10/WinForms, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-18-audit-hardening-design.md`

## Global Constraints

- Estado atual da `main` é a fonte de verdade.
- Nenhuma mudança de arquitetura central.
- Nenhum dado fiscal novo pode ser enviado ao Cloudflare.
- Authenticode pode ser usado opcionalmente quando configurado, mas sua ausência não bloqueia CI, updater ou release.
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

- [x] Escrever testes que exijam máximo de 100 chaves válidas, preservação do erro inicial do lote, elementos `hidden` não exibidos e ZIP sem buffer final monolítico/limite agregado.
- [x] Confirmar RED no CI.
- [x] Implementar o mínimo: `MAX_BATCH_ITEMS = 100`, estado final de erro explícito, regra CSS de `hidden`, Blob por partes e teto agregado.
- [x] Confirmar GREEN.

## Task 2: Hardening do Worker

**Files:**
- Modify: `worker/fiscal-coordination-http.ts`
- Modify: `worker/update-proxy.ts`
- Modify: `worker/index.ts`
- Modify: `wrangler.jsonc`
- Modify: `apps/web/tests/fiscal-coordinator-worker.test.ts`
- Modify: `apps/web/tests/update-proxy-worker.test.ts`
- Modify: `apps/web/tests/deploy-config.test.ts`

- [x] Escrever testes para chave de rate limit derivada do IP Cloudflare, limiter separado de update e cache de metadata.
- [x] Confirmar RED.
- [x] Implementar limiter por IP para coordenação, novo `UPDATE_RATE_LIMITER` e cache curto da metadata.
- [x] Confirmar GREEN.

## Task 3: Updater e release sem dependência obrigatória de Authenticode

**Files:**
- Modify: `apps/bridge/windows/NfeAgendamento.App/UpdateService.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.App/Program.cs`
- Delete: `apps/bridge/windows/NfeAgendamento.App/AuthenticodeVerifier.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/UpdateServiceTests.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/TrayUpdaterStaticTests.cs`
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/WorkflowHardeningStaticTests.cs`

- [x] Escrever testes que exijam updater baseado em origem/tamanho/SHA-256 sem verificador obrigatório de assinatura.
- [x] Confirmar RED no CI.
- [x] Remover a injeção obrigatória de `WinVerifyTrust` do updater.
- [x] Remover o gate obrigatório de Authenticode dos commits de release.
- [x] Preservar assinatura opcional quando os secrets estiverem configurados.
- [x] Confirmar GREEN no CI final.

## Task 4: Acessibilidade do viewer DANFE

**Files:**
- Modify: `apps/web/src/danfe/viewer.ts`
- Modify: `apps/web/src/main.ts`
- Modify: `apps/web/tests/danfe-viewer.test.ts`

- [x] Escrever testes de Tab/Shift+Tab e restauração do foco.
- RED histórico desta tarefa não foi registrado separadamente antes da implementação; a regressão permanece coberta pela suíte atual.
- [x] Implementar focus trap e retorno ao foco anterior.
- [ ] Confirmar GREEN.

## Task 5: Portal e E2E da interface

**Files:**
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/PortalSecurityPolicy.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/PortalWindow.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PortalSecurityPolicyTests.cs`
- Create: `tests/playwright/consultation-flow.spec.ts`
- Modify: `tests/playwright/playwright.config.ts`
- Modify: `.github/workflows/ci.yml`

- [x] Adicionar limpeza de XML temporário com mais de 24 horas no diretório dedicado do Portal.
- [x] Adicionar E2E em Chromium cobrindo consulta unitária, botão Cancelar, card estático, ações e Nova consulta.
- [x] Confirmar GREEN no CI final.

### Cobertura automatizada

- [x] Adicionar `@vitest/coverage-v8` 5.0.0 pelo lockfile gerado pelo npm.
- [x] Medir `apps/web/src/**/*.ts` e `worker/**/*.ts` no job web e registrar o resumo no CI.

## Task 6: Supply chain e documentação

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

- [x] Pin CodeQL v4 pelo commit atual `1c5b675653bb5c22dbe9b12b556ec555138e09fd`.
- [x] Atualizar docs para v0.0.16, teto 100, limiter por IP/cache de update e Authenticode opcional.
- [x] Registrar ruleset/branch protection como opcional e fora do backlog.
- [x] Rodar busca final por referências canônicas obsoletas `0.0.14` — as ocorrências restantes são apenas histórico de releases/planos antigos.

## Task 7: Verificação final

- [x] Confirmar CI `web`, `bridge`, `fiscal-compatibility`, `danfe-print`, `windows-package` no HEAD final.
- [x] Confirmar CodeQL no HEAD final.
- [x] Revisar diff entre o SHA inicial `e9c2e6d7287f4495e55106306eacf72867049ec6` e HEAD.
- [x] Registrar Authenticode e ruleset/branch protection como opcionais e fora do backlog.


## Fechamento em 18/09/2026

- Snapshot técnico validado após a decisão final sobre controles opcionais: `fdab221aa245d1be0130722d550dbe55d399df74`.
- CI: `web`, `bridge`, `fiscal-compatibility`, `danfe-print` e `windows-package` concluídos com sucesso.
- Web: 169 testes, 29 arquivos, cobertura V8 registrada (55,07% statements / 54,68% branches / 62,45% functions / 56,98% lines).
- Bridge: suíte e build concluídos no CI final sem falhas.
- Playwright: 3 testes E2E/regressão concluídos.
- CodeQL: C# e JavaScript/TypeScript concluídos com sucesso.
- `npm audit`: 0 vulnerabilidades conhecidas no job web e no pacote Playwright.
- Authenticode e ruleset/branch protection são opcionais e não representam pendências do projeto.

### Decisão final sobre Authenticode/ruleset

Em 18/09/2026 o proprietário confirmou que Authenticode e ruleset/branch protection não são necessários para este projeto. O updater e a release voltaram a depender das validações obrigatórias de origem, nome/versionamento, tamanho e SHA-256, enquanto a assinatura do CI permanece apenas opcional quando os secrets existirem. O CI completo e o CodeQL do snapshot `fdab221aa245d1be0130722d550dbe55d399df74` concluíram com sucesso.
