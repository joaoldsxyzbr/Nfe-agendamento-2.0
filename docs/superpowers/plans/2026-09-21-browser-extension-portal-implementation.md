# Browser Extension Portal — Implementation Plan

**Date:** 2026-09-21  
**Spec:** `docs/superpowers/specs/2026-09-21-browser-extension-portal-design.md`  
**Branch:** `feat/browser-extension-portal`

## Goal

Adicionar uma extensão Chromium Manifest V3 que assuma o fallback pelo Portal Nacional em popup do navegador, devolva o XML ao site e preserve o helper WebView2 como fallback reversível até validação física.

## Global constraints

- não remover Bridge, helper WebView2, consulta direta SEFAZ, `FiscalUsageGuard` ou coordenação multi-PC;
- hCaptcha permanece manual;
- extensão só opera o domínio oficial do site e `www.nfe.fazenda.gov.br`;
- nenhuma chave privada/PFX/senha sai do Windows;
- nenhuma permissão `<all_urls>`, Native Messaging ou acesso genérico ao disco;
- XML máximo 10 MiB;
- site continua validando o XML contra a chave consultada;
- lote continua sequencial;
- extensão indisponível deve degradar para o helper atual;
- mudança deve permanecer isolada na feature branch até CI verde.

## File map

### New extension

- `apps/extension/package.json` — scripts/dependências da extensão.
- `apps/extension/tsconfig.json` — TypeScript da extensão.
- `apps/extension/manifest.json` — Manifest V3 e permissões mínimas.
- `apps/extension/scripts/build.mjs` — bundle determinístico dos três entrypoints e cópia do manifest.
- `apps/extension/src/protocol.ts` — schemas, tipos e validação do protocolo.
- `apps/extension/src/site-bridge.ts` — ponte segura entre o site e `chrome.runtime`.
- `apps/extension/src/background.ts` — state machine, popup, roteamento e captura da requisição XML.
- `apps/extension/src/portal-content.ts` — leitura/automação estrita do DOM oficial.
- `apps/extension/src/portal-dom.ts` — funções puras/testáveis para reconhecer controles e estados.
- `apps/extension/src/portal-request.ts` — allowlist e reconstrução segura da requisição oficial de XML.
- `apps/extension/tests/*.test.ts` — protocolo, segurança, DOM e lifecycle.

### Web

- `apps/web/src/portal/extension-client.ts` — cliente do canal `window.postMessage`.
- `apps/web/src/portal/router.ts` — prefere extensão, cai para `PortalFallbackController`.
- `apps/web/src/main.ts` — composição do `PortalRouter` e copy de estado.
- `apps/web/tests/portal-extension.test.ts` — transporte/handshake.
- `apps/web/tests/portal-router.test.ts` — preferência e fallback.
- `apps/web/tests/portal-integration.test.ts` — integração preservando pipeline atual.

### Workspace / CI / docs

- `package.json` — adicionar workspace/scripts da extensão.
- `package-lock.json` — lockfile atualizado.
- `.github/workflows/ci.yml` — job da extensão e artifact ZIP.
- `README.md` — arquitetura/piloto.
- `docs/testing/browser-extension-portal.md` — instalação manual e aceitação.

## Task 1 — RED: contratos, manifest e roteamento esperado

### Tests first

Criar testes que falham porque a extensão ainda não existe:

1. `apps/extension/tests/manifest.test.ts`
   - `manifest_version === 3`;
   - sem `<all_urls>`;
   - hosts apenas site oficial e Fazenda;
   - permissões exatamente `scripting`, `webRequest` e `storage`;
   - content scripts somente nos dois hosts;
   - service worker configurado.

2. `apps/extension/tests/protocol.test.ts`
   - aceita apenas mensagens conhecidas;
   - rejeita chave inválida, requestId vazio e tipos desconhecidos;
   - limita XML a 10 MiB;
   - estados terminais bem definidos.

3. `apps/web/tests/portal-router.test.ts`
   - extensão ready => usa extensão;
   - extensão ausente/incompatível => usa Bridge;
   - falha depois de operação iniciada não abre automaticamente o segundo caminho para a mesma operação;
   - cancelamento roteado ao backend correto.

### RED verification

Abrir PR da branch para `main` após o commit somente de testes/workspace mínimo e observar o job `web`/novo `extension` falhar pelas implementações ausentes.

**Expected:** CI vermelho por módulos/implementações ausentes, sem falhas estranhas de infraestrutura.

Commit: `test: definir contrato do Portal por extensão`.

## Task 2 — GREEN: workspace MV3 e protocolo

Implementar:

- workspace `apps/extension`;
- build com esbuild;
- manifest MV3;
- `protocol.ts`;
- `site-bridge.ts` com validação de origem, source e schema;
- `extension-client.ts` no site com handshake timeout curto e correlação por requestId.

### Tests

- Task 1 protocol/manifest;
- novos testes do cliente do site para ready, timeout e resposta inválida.

**Expected:** protocol/manifest/client verdes; portal lifecycle ainda pode estar incompleto.

Commit: `feat: criar base da extensão MV3`.

## Task 3 — Portal popup e DOM estrito

### RED

Adicionar testes para:

- URL oficial de consulta;
- preenchimento da chave em seletor conhecido;
- identificação dos botões oficiais `Consultar`/hCaptcha;
- nenhuma chamada `hcaptcha.execute`/`grecaptcha.execute`;
- reconhecimento do controle `Download do Documento`;
- rejeição de host/path não permitido.

### GREEN

Implementar `portal-dom.ts`, `portal-content.ts` e lifecycle inicial no `background.ts`:

- `chrome.windows.create({ type: 'popup' })`;
- associação window/tab ↔ operationId;
- preencher chave;
- estado `waiting_user`;
- detectar resposta humana existente e acionar somente botão oficial;
- detectar fechamento da janela e retornar `cancelled`.

Commit: `feat: abrir Portal em popup do navegador`.

## Task 4 — Captura segura da requisição XML

### RED

Testes para `portal-request.ts`:

- aceita somente HTTPS + host oficial + path de download NF-e;
- rejeita URL arbitrária;
- reconstrói GET e POST conhecidos;
- ignora requisições iniciadas pela própria extensão;
- limita body;
- valida resposta XML: <= 10 MiB, sem DTD e estrutura mínima `nfeProc`.

### GREEN

No background:

- registrar `chrome.webRequest.onBeforeRequest` apenas para o path oficial;
- associar evento à operação/tab ativa;
- capturar URL/método/body necessário;
- reproduzir com `fetch(..., { credentials: 'include' })`;
- não expor cookies/headers ao site;
- validar XML;
- emitir `completed`;
- limpar listeners/estado.

Se o Portal não permitir reprodução segura, retornar erro específico `portal_xml_capture_unavailable`, mantendo o helper como fallback em nova ação.

Commit: `feat: devolver XML do Portal ao site`.

## Task 5 — Router web e integração unitária

### RED

Expandir testes web:

- `PortalRouter.start/waitForResult/cancel`;
- handshake uma vez por sessão;
- rota extension quando ready;
- rota Bridge quando extension unavailable;
- status/copy `Portal pelo navegador`;
- XML da extensão passa por `parseNfeXml(xml, accessKey)`;
- nenhuma chamada SEFAZ extra.

### GREEN

Implementar `apps/web/src/portal/router.ts` e trocar composição de:

`PortalFallbackController -> PortalRouter(extensionClient, portalFallback)`

Sem alterar interfaces de consultation/batch controllers.

Commit: `feat: preferir extensão no fallback Portal`.

## Task 6 — Lote e cancelamento

### RED

Cobrir:

- um popup/operação por vez;
- próxima NF-e só começa após terminal da anterior;
- cancelamento do lote fecha operação da extensão;
- pagehide cancela operação ativa;
- falha de uma operação não duplica fallback automaticamente.

### GREEN

Ajustar apenas se os contratos atuais exigirem; preservar processamento sequencial existente.

Commit: `test: cobrir Portal por extensão no lote` ou `feat: integrar extensão ao lote` se houver código necessário.

## Task 7 — CI e artifact instalável

Adicionar ao root:

- workspace `apps/extension`;
- `test:extension`;
- `build:extension`.

CI:

- novo job `extension`;
- `npm ci`;
- audit;
- test;
- build;
- verificar manifest;
- zipar `apps/extension/dist`;
- upload artifact `NFeAgendamento-Extension-MV3`.

`windows-package` não depende desse job no piloto, pois o helper permanece fallback. O gate geral da PR, porém, deve exigir o job extension verde.

Commit: `ci: validar e empacotar extensão MV3`.

## Task 8 — Documentação

Atualizar:

- `README.md`: arquitetura piloto, extensão preferida para Portal, helper fallback;
- criar `docs/testing/browser-extension-portal.md` com:
  - baixar artifact;
  - extrair;
  - `chrome://extensions` / modo desenvolvedor / carregar sem compactação;
  - permissões esperadas;
  - teste de handshake;
  - teste Portal real;
  - rollback desabilitando extensão;
- atualizar documentação de Portal atual para indicar que WebView2 é fallback durante o piloto;
- não declarar validação física como concluída.

Commit: `docs: documentar piloto da extensão do Portal`.

## Task 9 — Whole-branch verification

Verificar via PR:

- `web` verde;
- `extension` verde;
- `danfe-print` verde;
- `bridge` verde;
- `fiscal-compatibility` verde;
- `windows-package` verde;
- CodeQL sem regressão relevante.

Revisar diff final contra a spec:

- nenhuma permissão excessiva;
- nenhuma chave/XML em logs;
- helper atual preservado;
- nenhum retry fiscal;
- nenhum bypass de captcha;
- nenhum acesso genérico a URLs no service worker.

Somente após todos os gates automatizados verdes, integrar a branch na `main`.

## Physical validation after merge

Não é gate para implementação, mas é gate para remover WebView2:

1. instalar artifact da extensão;
2. confirmar handshake no site;
3. caso real de Portal;
4. popup Chrome/Edge;
5. chave preenchida;
6. hCaptcha manual;
7. certificado A1 usado pelo navegador;
8. XML retorna ao site;
9. DANFE/baixar XML;
10. segunda operação;
11. lote;
12. desabilitar extensão e confirmar fallback WebView2.

Se a captura XML falhar em navegador real, manter WebView2 e ajustar apenas a extensão; não ampliar permissões sem nova decisão arquitetural.
