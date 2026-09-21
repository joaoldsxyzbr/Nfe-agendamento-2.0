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

- [ ] Atualizar a seção de distribuição Windows para v0.0.17.
- [ ] Atualizar o asset principal para `NFeAgendamentoBridge-Setup-v0.0.17.exe`.
- [ ] Atualizar a referência de release atual para `docs/releases/v0.0.17.md`.
- [ ] Fazer busca final por referências canônicas obsoletas à v0.0.16; preservar apenas histórico/migração.

### Task 2: Integrar atualizações de dependência compatíveis

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package-lock.json` quando necessário
- Modify: `tests/unimake-poc/UnimakePoc.csproj`

**Interfaces:**
- Consumes: propostas dos PRs #3, #4, #5 e #6.
- Produces: dependências atualizadas sobre a `main` atual com lockfile válido.

- [ ] Integrar `@types/node 26.6.0` se os gates atuais permanecerem verdes.
- [ ] Integrar `vite 8.3.0` se os gates atuais permanecerem verdes.
- [ ] Recriar corretamente `wrangler 4.131.2` com lockfile sincronizado; o PR #4 antigo não pode ser aceito com `npm ci` quebrado.
- [ ] Integrar `Unimake.DFe 20260915.1624.35` se o POC fiscal permanecer verde.
- [ ] Rodar/observar CI completo do SHA final.

### Task 3: Encerrar backlog automático

**Files:** nenhum arquivo obrigatório.

**Interfaces:**
- Consumes: estado final da `main` e CI.
- Produces: PRs #3-#6 fechados/mesclados com decisão explícita.

- [ ] Mesclar PRs que ainda representem exatamente a mudança integrada e estejam seguros.
- [ ] Fechar como superseded qualquer PR cuja mudança tenha sido aplicada diretamente na `main`.
- [ ] Confirmar ausência de issues funcionais abertas.
- [ ] Confirmar que CI e CodeQL do HEAD final estão verdes.
