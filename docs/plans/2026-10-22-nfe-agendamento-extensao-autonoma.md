# Plano — NFe Agendamento inteiramente na extensão Chromium

**Data:** 22/10/2026  
**Status:** PLANEJADO — implementação e aceitação física NÃO iniciadas  
**Branch experimental:** `nfe-agendamento`  
**Base Git:** `main` no commit `2bebbc11a0ff0f14da41da5d0207061f8213bb98`  
**Escopo deste registro:** documentação do plano, sem modificar código, infraestrutura, releases ou dados fiscais.

## 1. Objetivo e limites

Transformar o produto atual **site estático + extensão Chrome/Edge + Portal Nacional** em **uma única extensão Manifest V3**, com interface completa aberta em uma aba própria (`chrome-extension://.../app.html`), sem depender de hospedagem Cloudflare, Workers Static Assets, D1 ou backend próprio para operar.

- Preservar consulta individual, lote sequencial, cancelamento, reconsulta, importação de XML local, validação de chave/XML, DANFE, impressão/PDF, ZIP, CSV, tema, configurações e regras de fornecedor.
- Usar JavaScript ES Modules, HTML e CSS puros; manter ferramentas atuais de empacotamento/teste somente onde necessárias; não introduzir React, Vite, TypeScript ou novas bibliotecas comunitárias.
- O Portal Nacional da NF-e **continua externo e exige internet**; o produto não poderá consultar NF-e offline. hCaptcha permanece manual, e certificados continuam administrados pelo Chrome/Edge e sistema operacional.
- O GitHub permanece como código-fonte, área de desenvolvimento e canal de distribuição de ZIP. Não apagar/desligar o serviço Cloudflare da `main` nesta branch.
- Não migrar para consulta direta à SEFAZ, não criar novos serviços, banco remoto, Native Messaging, bypass de captcha nem leitura de PFX/P12.

## 2. Estado verificado e impacto da migração

Fontes vigentes: `README.md`, `AGENTS.md`, `docs/README.md`, `docs/architecture/frontend-boundaries.md`, `docs/architecture/site-estatico-sem-vite.md`, `docs/testing/browser-extension-portal.md`.

| Hoje na main | Alvo na branch |
| --- | --- |
| `apps/web/index.html` e `apps/web/src/**` hospedados por Workers Static Assets | Mesma UI e módulos distribuídos dentro do ZIP da extensão, sem segunda implementação |
| `apps/web/src/portal/extension-client.js`: `window.postMessage` + ponte `site-bridge.js` | Transporte interno restrito via `chrome.runtime.sendMessage`, com contrato já conhecido |
| `apps/extension/src/background.js` exige origem do site e `sender.tab.id` | Autorizar **somente** a página própria de UI e o content script oficial; tratar remetente UI (que pode não ter `sender.tab`) separadamente |
| `chrome.action.onClicked` abre opções | Abre/reutiliza uma aba local `app.html`, com acesso às opções dentro da UI |
| `manifest.json`: host do site e script content do site | Remover ponte/host do site apenas após teste; manter somente host do Portal e permissões necessárias |
| `apps/extension/scripts/build.mjs` empacota scripts/options | Também copia HTML/CSS/JS/imagens da UI com caminhos relativos válidos para `chrome-extension://` |
| `wrangler.jsonc`, job `web` e release destinados ao site | Na branch concluída: pipeline e distribuição focados na extensão; **não** remover controles de CI sem substituição equivalente |

A `main` está em JavaScript/HTML/CSS, sem frontend bundler e sem backend fiscal: já é possível reaproveitar boa parte do código. **O fluxo de Portal/XML é sensível**: houve regressões de captura em versões históricas e o aceite físico atual não deve ser presumido.

## 3. Arquitetura-alvo

```text
Usuário -> ícone da extensão -> app.html (aba interna)
                                   |
                         UI: consulta, lote e DANFE
                                   |
                       chrome.runtime.sendMessage
                                   |
                    Service worker Manifest V3
                                   |
                        Janela do Portal Nacional
                                   |
                  Content script / requisição oficial
                                   |
                   hCaptcha resolvido pelo usuário
                                   |
             XML oficial validado -> UI -> DANFE/ZIP/CSV
```

### 3.1 Contrato entre UI e extensão

- Manter semântica dos comandos `ping`, `start`, `status`, `cancel`, `resolve_supplier` e `open_options` e os resultados atuais; trocar o transporte, não a regra fiscal.
- Na página interna, usar API de mensagens do navegador, sem `window.postMessage` com o site e sem `externally_connectable` aberto ao público.
- No service worker, validar `sender.id`, `sender.url`/`sender.origin` e caminho da página da extensão para comandos da UI; comandos do Portal permanecem com validação estrita de URL/aba e de operação. **Não** permitir requisições genéricas, URLs arbitrárias nem comandos vindos de páginas comuns.
- Eventos/progresso devem chegar à UI por mensagens internas; considerar reconexão por estado da operação se aba recarregar. A abertura de várias abas da UI não deve criar várias operações simultâneas.

### 3.2 Dados e ciclo de vida

- `chrome.storage.local`: apenas configurações privadas necessárias, restritas a contextos confiáveis; preservar schema atual `supplierRulesV1`.
- `chrome.storage.session`: estado mínimo e não sensível para reconciliação enquanto a extensão estiver ativa; não registrar XML/chaves completas em logs/telemetria.
- **Decisão para implementação/teste:** estabelecer entrega confiável do XML entre Portal → service worker → UI com identificação de operação, confirmação de recebimento e comportamento seguro se a UI fechar. Não assumir que o service worker MV3 ficará ativo durante todo o hCaptcha nem que XML de até 10 MiB cabe em `storage.session`; medir limites e tratar perda de contexto sem repetição automática da consulta.
- Dados fiscais são processados em memória na UI, sem sincronização com nuvem. Downloads e impressão usam APIs do navegador já permitidas; permissões adicionais exigem justificativa e testes.

### 3.3 Interface e empacotamento

- Primeira escolha: **aba completa** `app.html` (não popup minúsculo do ícone). Clique no ícone abre ou foca a aba existente.
- Reutilizar `apps/web/src` e `apps/web/public` sem duplicar componentes. Para a fase inicial, copiar assets no build da extensão e mapear imports/CSS/imagens para caminhos relativos no pacote.
- Extrair o script inline do `apps/web/index.html` para arquivo próprio antes de carregar como página MV3; scripts inline não passam pela CSP atual da extensão.
- Manter impressão A4/DANFE, scroll/zoom, download ZIP e arquivo XML funcionando nas URLs internas, sem dependência de host HTTP.
- Conservar página de opções até que a experiência de configuração integrada esteja validada; não remover antes.

## 4. Plano de execução por gates

**Fase 0 — Baseline e testes**
- Arquivos-base: `README.md`, `docs/README.md`, `apps/web/src`, `apps/extension/src`, `apps/extension/tests`, `apps/web/tests`, `tests/playwright`.
- Registrar versão/SHAs, CI e falhas preexistentes. Rodar `npm ci`, `npm audit --audit-level=high`, `npm run lint:web`, `npm run format:check:web`, `npm run test:web`, `npm run test:extension`, `npm run build:web`, `npm run build:extension`; executar testes Playwright pertinentes.
- **Gate:** baseline reproduzível e distinção clara entre falhas existentes e novas.

**Fase 1 — Interface local mínima**
- Criar `apps/extension/app.html` (ou caminho equivalente) e adaptar `apps/extension/scripts/build.mjs` para incorporar assets atuais. Prever ícone que abre/foca a aba.
- Testar abertura, visualização, tema, navegação, CSS/imagens, Console sem erro e ausência de requisições ao domínio hospedado.
- **Gate:** a interface abre sem Cloudflare e mantém layout funcional.

**Fase 2 — Transporte interno seguro**
- Adaptar `apps/web/src/portal/extension-client.js` para injeção de transporte interno ou criar adaptador, preservando contrato público do controller.
- Ajustar `apps/extension/src/background.js`, `protocol.js` e testes para identidade/origem de remetentes internos, separando contexto UI do contexto Portal. Não afrouxar verificação de origem.
- **Gate:** handshake, configurações, resolução de fornecedor, `start/status/cancel` e eventos internos passam nos testes com remetentes legítimos e ilegítimos.

**Fase 3 — Fluxo fiscal completo**
- Reusar `portal-content.js`, `portal-fetch.js`, `portal-request.js`, `batch/controller.js`, `nfe/xml.js` e `danfe/**` sem reinventar a captura autenticada.
- Validar: chave única; segundo XML; lote estritamente serial; cancelamento durante abertura/janela/hCaptcha; erros do Portal; importação manual do XML; reconexão da UI e suspensão/reinício do worker sem consulta duplicada.
- **Gate:** provas automatizadas e teste físico positivo da entrega do XML até a página interna.

**Fase 4 — Saídas e dados locais**
- Adaptar caminhos relativos, downloads de XML/ZIP/CSV, impressão e PDF/DANFE, preservando validação cruzada de chave, limite de 10 MiB após leitura, rejeição de DTD e regras privadas locais.
- **Gate:** resultado idêntico ao fluxo atual e nenhuma exposição indevida de documentos fiscais.

**Fase 5 — Redução de permissões/legado**
- Somente após fases anteriores: remover da **branch** host/site bridge desnecessários, dependência de `SITE_ORIGIN` nos comandos internos e código sem consumidor; simplificar mensagens de integração e configuração.
- Revisar `manifest.json` e confirmar que host do Portal é suficiente. Não incluir `<all_urls>`, `webRequestBlocking`, `nativeMessaging` ou `downloads` sem necessidade técnica demonstrada.
- **Gate:** pacote instalável e permissões mínimas; comparação de arquivos/recursos com a `main`.

**Fase 6 — CI, distribuição e documentação**
- Atualizar **somente na branch** `.github/workflows/ci.yml`, `release.yml`, scripts, `README.md`, `docs/README.md`, testes e registro de aceite para refletir produto extensão única.
- Manter segurança npm, lint, testes/cobertura, build, testes de UI/DANFE e inspeção do ZIP MV3. Retirar `wrangler deploy --dry-run` apenas quando o produto da branch realmente não usar hospedagem.
- GitHub Actions hoje tem `CI` em push da `main` e em PR contra `main`; para validar a branch antes de PR, usar comandos locais ou workflow específico **sem publicar produção**.
- **Gate:** ZIP autocontido, configuração/release rastreáveis e instalação sem depender do site.

**Fase 7 — Aceitação física e decisão**
- Instalar **em perfil separado** no Chrome e no Edge de Windows real; comparar com a `main` estável.
- Consultar NF-e legítima, hCaptcha manual, certificado quando exigido, XML, DANFE, PDF, CSV/ZIP, segunda consulta, lote de no mínimo 2 chaves, cancelamento, erro/recuperação e reabertura após fechar UI ou reiniciar navegador.
- Registrar apenas resultado técnico (sem chaves NF-e, XML, CNPJ, CPF, senhas ou PFX) em `docs/testing/acceptance-results/`.
- **Gate final:** aceitar a migração **somente** com CI e testes físicos comprovados. Se não funcionar, manter branch isolada; não integrar `main` nem desligar Cloudflare.

## 5. Riscos e respostas previstas

| Risco | Tratamento |
| --- | --- |
| `sender.tab` ausente em páginas da extensão | Handler separado para página interna com validação de `sender.id` e caminho permitido |
| CSP MV3 rejeita HTML/script inline | Migrar inicialização inline para módulo JS empacotado e teste de instalação |
| URLs absolutas `/src/...` e `/brand-mark.png` | Revisar HTML, JS e assets para esquema `chrome-extension://` |
| Background dorme enquanto usuário resolve hCaptcha | Persistir estado mínimo de operação, mensagens orientadas a eventos, testar reconexão sem duplicação |
| Captura XML quebra em Portal real | Preservar implementação 0.2.16, testar na sessão oficial, parar rollout caso falhe |
| XML até 10 MiB excede buffer/cota ou falha no handoff | Medir transporte, limite e pressão de memória; não assumir storage para payload |
| Instalação nova conflita com extensão antiga | Usar perfil separado e não consultar simultaneamente com ambas |
| Regras privadas / dados fiscais vazam | Dados sintéticos em testes, sem XML real no repositório/log, menor conjunto de hosts |

## 6. Critérios objetivos de pronto

- [ ] Extensão MV3 abre UI completa no Chrome e Edge sem abrir domínio do site.
- [ ] Desligar acesso ao domínio do NFe Agendamento/Cloudflare **não impede** UI, configuração e processamento local.
- [ ] Operação fiscal continua acessando somente o Portal Nacional legítimo com internet.
- [ ] HCaptcha exclusivamente manual e certificado gerenciado pelo navegador.
- [ ] Consulta única, segunda consulta, lote sequencial e cancelamento funcionam em navegador real.
- [ ] XML correspondente à chave é validado; limite, DTD e privacidade são preservados.
- [ ] DANFE, impressão/PDF, XML, ZIP, CSV, tema e configurações funcionam.
- [ ] Fechar/reabrir UI e suspender worker não gera duplicação de operações nem perda silenciosa de estado.
- [ ] ZIP autocontido instalável, sem permissões desnecessárias, sem backend próprio.
- [ ] CI aplicável e aceite físico em Chrome/Edge registrados explicitamente.
- [ ] `main`, Worker Cloudflare vigente, domínio, releases e banco permanecem intocados até decisão posterior.

## 7. Estratégia de reversão e decisão

Esta branch é um **experimento isolado**: nenhum deploy, merge, exclusão de infraestrutura ou alteração fiscal real foi autorizado nesta etapa. Se qualquer gate falhar, o sistema atual continua funcionando na `main`. Reverter o piloto consiste em desinstalar a extensão experimental/perfil de testes, sem restaurar dados em serviços remotos. Aprovação técnica da branch **não equivale** a autorização para mesclar na `main`; decidir a publicação separadamente.

**Próximo passo autorizado futuramente:** iniciar a Fase 0 e executar fases com PRs/commits pequenos e evidência no GitHub. Este documento não declara código implementado nem testes executados.
