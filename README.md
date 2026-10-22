# NFe Agendamento 2.0 — extensão independente (piloto)

**Branch de desenvolvimento:** `nfe-agendamento` · **Manifest V3:** `0.3.0` · **Chrome / Edge desktop**

O NFe Agendamento funciona dentro de uma **janela popup própria**, com aproximadamente metade da largura do navegador. A consulta continua no Portal Nacional da NF-e, com **hCaptcha manual** e certificado digital do navegador quando necessário. Nenhum servidor próprio, Cloudflare Worker, D1 ou site hospedado é necessário para a execução.

## Estrutura atual

- `apps/ui/` — interface em JavaScript puro, HTML e CSS; tratamento de XML, DANFE, lote e testes. É código incorporado à extensão, **não um site implantado**.
- `apps/extension/` — manifesto MV3, service worker, integração com o Portal, opções, testes e build do ZIP.
- `scripts/` — validação, formatação e servidor de preview **exclusivo para testes**.
- `tests/playwright/` — cenários automatizados de consulta simulada e impressão.
- `docs/` — arquitetura atual, aceitação, decisões e histórico.

Fluxo: popup local `app.html` → mensagens `chrome.runtime` → service worker MV3 → Portal Nacional → XML conferido → DANFE / impressão / CSV / ZIP.

## Compilar e verificar

Requer Node.js e npm:

```bash
npm ci
npm audit --audit-level=high
npm run lint:ui
npm run format:check:ui
npm run test:ui
npm run test:extension
npm run build:extension
```

O resultado está em `apps/extension/dist/`. Em `chrome://extensions` ou `edge://extensions`, ative o Modo do desenvolvedor → **Carregar sem compactação** → escolha essa pasta. Clique no ícone para abrir ou focar a janela popup. Nenhum Node.js fica em execução após a instalação.

## Releases

O [piloto 2 com popup](https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/tag/v0.3.0-pilot.2) foi publicado antes da reorganização da estrutura. **O ZIP dessa release não inclui automaticamente as alterações mais recentes da branch.** Os builds de teste são gerados pelo CI, e a publicação estável só deve ocorrer após homologação.

Não instale o piloto sobre a versão antiga durante uma operação fiscal; prefira um perfil separado no navegador. O armazenamento das regras de fornecedores é local (`chrome.storage.local`), sem exposição de dados fiscais ao GitHub.

## Critérios para integração à main

- Testes de UI e extensão, cobertura, impressão e auditoria de dependências aprovados no CI.
- Testes físicos de Chrome e Edge com Portal oficial, XML, DANFE, lote, cancelamento, reabertura de janela e impressão.
- Evidências registradas no [checklist](docs/testing/extension-only-acceptance.md) e na [PR #107](https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/pull/107).

**A branch `main` e a infraestrutura anterior não foram alteradas.** Não desligar serviços nem mesclar o piloto antes da aceitação física.

## Documentação

- [Arquitetura de extensão única](docs/architecture/extension-only.md)
- [Índice de documentos](docs/README.md)
- [Plano inicial de migração](docs/plans/2026-10-22-nfe-agendamento-extensao-autonoma.md)
- [Histórico de releases](docs/releases/)
