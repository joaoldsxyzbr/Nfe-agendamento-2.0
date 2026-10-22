# Arquitetura — extensão única

**Data:** 22/10/2026 · **Branch:** `nfe-agendamento` · **Status:** piloto, aceitação física ainda não homologada.

## Componentes

- `apps/ui/src`: interface, tema, lote, XML, DANFE, CSV, ZIP, regras de apresentação. ES Modules, HTML e CSS puros.
- `apps/extension/src`: service worker MV3, captura oficial do Portal, controle da janela, fornecedores locais e tela de opções.
- `apps/extension/scripts/build.mjs`: inclui a UI no pacote `dist/app.html`, preserva os arquivos locais e produz os scripts da extensão.
- `tests/playwright`: testa comportamento e impressão com dados sintéticos; o servidor HTTP de preview serve **somente** aos testes.

O aplicativo não tem site separado nem backend próprio. Não usa Workers Cloudflare, D1, React, Vite ou serviços Windows em sua execução.

## Fluxo de consulta

Ícone da extensão → janela popup da UI (`chrome-extension://…/app.html`) → `chrome.runtime.sendMessage` → service worker da extensão → janela de consulta do Portal Nacional da NF-e → hCaptcha manual, certificado do navegador quando aplicável → XML validado → DANFE, download ou impressão.

O popup da UI usa aproximadamente 50% da largura da janela normal e 85% de sua altura, com limites para monitores menores. O segundo clique foca a janela já aberta. O Portal tem popup próprio e separado.

## Segurança e privacidade

- Manifest V3 e permissões limitadas: `scripting`, `storage`, `webRequest`; host `https://www.nfe.fazenda.gov.br/*`.
- Somente a `app.html` da própria extensão pode iniciar comandos internos. O worker verifica ID, origem e aba, além de manter uma operação ativa em `chrome.storage.session`.
- Ponte antiga `site-bridge.js`, `window.postMessage` do site e permissão do domínio hospedado foram removidas do caminho de execução.
- Regras de fornecedor permanecem locais em `chrome.storage.local`. Não versionar certificado, XML fiscal real, chave completa ou dados pessoais.
- XML até 10 MiB, sem DTD, com chave correspondente à consulta.
- Nenhuma automação de CAPTCHA; é necessário resolver o desafio manualmente.
- A suspensão/reinicialização de service workers MV3 e o tráfego XML extenso ainda precisam de validação em navegador real.

## Build, teste e aceite

Execute `npm ci`, lint, formatação, testes de UI/extensão, build e auditoria. O CI integra testes automatizados de impressão. A publicação estável fica bloqueada até o checklist físico de [Chrome/Edge](../testing/extension-only-acceptance.md) e a aprovação do PR.

A integração Cloudflare preexistente pode continuar exibindo checks no GitHub, mas não faz parte do runtime do piloto. **A branch não desliga o site antigo e não altera a main.**
