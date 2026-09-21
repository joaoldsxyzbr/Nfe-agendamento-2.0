# Pending Maintenance Resolution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolver as pendências restantes do repositório após a v0.0.17: inconsistência documental no README e PRs de dependência #3, #4, #5 e #6.

**Architecture:** Preservar a arquitetura e o comportamento atuais. Alterações de dependência serão limitadas aos manifests/lockfiles necessários e validadas pelos gates existentes do CI; documentação será alinhada à versão canônica 0.0.17.

**Tech Stack:** Vite/TypeScript, npm workspaces, Wrangler, .NET 10, Unimake.DFe, GitHub Actions.

**Spec:** `README.md`, `docs/releases/v0.0.17.md` e os PRs Dependabot #3-#6 no estado atual da `main`.

## Global Constraints

- Usar a `main` atual como fonte de verdade.
- Não alterar lógica fiscal, DANFE, Portal, Bridge ou UI fora do necessário.
- Manter documentação sincronizada com o resultado.
- Não integrar atualização que deixe CI vermelho.
- Fechar PRs Dependabot somente depois de a mudança equivalente estar integrada ou conscientemente descartada.

## Review Focus

- `package.json` e `package-lock.json` devem permanecer sincronizados para `npm ci`.
- Atualizações Vite/Wrangler não podem quebrar build, testes ou dry-run do Worker.
- Atualização de Unimake.DFe deve preservar o POC fiscal.
- README deve apontar consistentemente para v0.0.17.
- Nenhum PR automático deve permanecer aberto sem decisão explícita.

---

### Task 1: Corrigir documentação da release atual

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: versão canônica `0.0.17` de `Directory.Build.props` e `docs/releases/v0.0.17.md`.
- Produces: README sem referência canônica obsoleta à v0.0.16.

- [x] Atualizar a seção de distribuição Windows para v0.0.17.
- [x] Atualizar o asset principal para `NFeAgendamentoBridge-Setup-v0.0.17.exe`.
- [x] Atualizar a referência de release atual para `docs/releases/v0.0.17.md`.
- [x] Fazer busca final por referências canônicas obsoletas à v0.0.16; preservar apenas histórico/migração.

### Task 2: Integrar atualizações de dependência compatíveis

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json` quando necessário
- Modify: `tests/unimake-poc/UnimakePoc.csproj`

**Interfaces:**
- Consumes: propostas dos PRs #3, #4, #5 e #6.
- Produces: dependências atualizadas sobre a `main` atual com lockfile válido.

- [x] Integrar `@types/node 26.6.1` com CI e CodeQL verdes.
- [x] Integrar `vite 8.3.0` com CI e CodeQL verdes.
- [x] Aplicar `wrangler 4.134.0` sobre a `main` atual com lockfile sincronizado; `npm ci` e CI completo ficaram verdes.
- [x] Encerrar o PR #6 após o Dependabot classificá-lo como não mais necessário; preservar o pin atual em vez de forçar uma atualização sem proposta vigente.
- [x] Rodar/observar CI completo do SHA final de código (`43adad1`): todos os jobs verdes; CodeQL JavaScript/TypeScript e C# verdes.

### Task 3: Encerrar backlog automático

**Files:** nenhum arquivo obrigatório.

**Interfaces:**
- Consumes: estado final da `main` e CI.
- Produces: PRs #3-#6 fechados/mesclados com decisão explícita.

- [x] Mesclar PRs que ainda representem exatamente a mudança integrada e estejam seguros (#3 e #5).
- [x] Fechar como superseded qualquer PR cuja mudança tenha sido aplicada diretamente na `main` (#4).
- [x] Confirmar ausência de issues funcionais abertas.
- [x] Confirmar que CI e CodeQL do HEAD final de código estão verdes.


## Resultado da execução — 21/09/2026

- README alinhado integralmente à release pública v0.0.17; referências a v0.0.16 permanecem apenas quando históricas/de migração.
- PR #3 integrado: `@types/node 26.6.1`.
- PR #5 integrado: `vite 8.3.0`.
- PR #4 aplicado diretamente na `main` como `wrangler 4.134.0` com o delta de lockfile validado, depois fechado como superseded.
- PR #6 encerrado pelo próprio Dependabot como não mais necessário; nenhum upgrade NuGet foi forçado sem proposta vigente.
- SHA de código consolidado: `43adad1c25f422e06842c3d9734da79fb9a539e4`.
- CI desse SHA: `web`, `bridge`, `danfe-print`, `fiscal-compatibility` e `windows-package` concluídos com sucesso.
- CodeQL desse SHA: JavaScript/TypeScript e C# concluídos com sucesso.
