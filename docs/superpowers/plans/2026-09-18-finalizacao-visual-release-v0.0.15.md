# Finalização visual e release v0.0.15 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refinar a interface atual sem alterar os fluxos funcionais e publicar a v0.0.15 a partir de um CI completamente verde.

**Architecture:** O frontend mantém a estrutura TypeScript/controladores atual. O refino fica restrito aos estilos e à apresentação já existente; nenhuma lógica fiscal, Bridge, DANFE, lote ou certificado muda. A release usa o pipeline atual, que publica apenas artifacts do mesmo SHA validado pelo CI.

**Tech Stack:** Vite, TypeScript, CSS, Vitest, Playwright/Chromium, .NET 10, GitHub Actions.

**Spec:** interface simples, sóbria e prática, sem aparência artificial; preservar a arquitetura; preparar e validar v0.0.15.

## Global Constraints

- Usar o estado atual da `main` como fonte de verdade.
- Não alterar arquitetura ou comportamento fiscal para resolver aparência.
- Manter Bridge somente loopback e controladores atuais.
- Preservar testes de DANFE, lote, certificado e consulta.
- Documentação e release notes devem terminar atualizadas na `main`.
- O commit marcador da release deve ser exatamente `release: v0.0.15`.

---

### Task 1: Refinar a interface sem alterar comportamento

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/brand.css`
- Modify: `apps/web/src/batch.css`
- Modify: `apps/web/src/settings-panel.css`

**Interfaces:**
- Consumes: classes e IDs já renderizados por `apps/web/src/main.ts`.
- Produces: mesma estrutura DOM, com apresentação mais compacta e sóbria.

- [ ] Remover excesso de gradientes, brilhos, sombras e arredondamentos.
- [ ] Reforçar hierarquia com superfícies planas, espaçamento consistente e uma cor principal azul.
- [ ] Reduzir branding e topo para priorizar consulta.
- [ ] Tornar certificado visualmente secundário e consulta visualmente principal.
- [ ] Simplificar resultado, botões e lote mantendo estados de sucesso/alerta/erro.
- [ ] Preservar breakpoint móvel e legibilidade do modal DANFE.
- [ ] Rodar lint, format check, testes e build do frontend via CI.

### Task 2: Preparar metadados e documentação da v0.0.15

**Files:**
- Modify: `Directory.Build.props`
- Modify: `README.md`
- Create: `docs/releases/v0.0.15.md`

**Interfaces:**
- Consumes: workflow `.github/workflows/release.yml`.
- Produces: versão canônica 0.0.15 e notas consumidas automaticamente pelo workflow.

- [ ] Alterar a versão canônica de `0.0.14` para `0.0.15`.
- [ ] Atualizar referências de versão e release atual no README.
- [ ] Documentar mudanças técnicas e visuais desde v0.0.14, sem declarar validação física não executada.
- [ ] Manter explícitas as pendências externas: A4 físico, Authenticode e proteção administrativa da main.

### Task 3: Publicar e verificar a release

**Files:**
- No additional source files.

**Interfaces:**
- Consumes: CI e Release GitHub Actions.
- Produces: tag/release `v0.0.15` com Setup e pacote portátil validados.

- [ ] Criar o commit marcador `release: v0.0.15`.
- [ ] Confirmar `web`, `danfe-print`, `bridge`, `fiscal-compatibility` e `windows-package` verdes.
- [ ] Confirmar CodeQL verde.
- [ ] Confirmar workflow Release concluído com sucesso e assets publicados.
