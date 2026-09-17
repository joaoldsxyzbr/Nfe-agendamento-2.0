# NFe Agendamento 2.0 — Current-State Hardening Roadmap Design

## Status

Design aprovado em conversa para consolidar as próximas melhorias do projeto antes de qualquer implementação.

Esta especificação parte exclusivamente do estado atual da `main` no commit `b092a88b1df4e1a24f5309c78a27c60bc593b00d` e substitui o uso do PR #7 como base de integração. O PR #7 passa a ser somente fonte de referência para código, testes e documentação que ainda façam sentido.

## Objetivo

Concluir o ciclo de endurecimento técnico e operacional do NFe Agendamento 2.0 sem alterar a arquitetura funcional já aprovada:

- site Cloudflare para interface, parsing XML, lote e DANFE;
- Worker Cloudflare mínimo para coordenação fiscal;
- Durable Object para proteção compartilhada do teto fiscal;
- App Windows por computador;
- Bridge local por computador, somente loopback;
- Helper Portal com WebView2 para fallback oficial;
- certificado A1 e chave privada permanecendo no Windows local.

O objetivo não é adicionar funcionalidades novas. O trabalho deve reduzir superfície de abuso, diminuir risco de manutenção no frontend, fechar controles administrativos externos, validar o sistema em ambiente real e produzir uma próxima release com evidência suficiente.

## Princípios obrigatórios

1. A `main` atual é a fonte de verdade.
2. Nenhuma etapa pode reintroduzir Central, pareamento, LAN, mDNS ou pasta compartilhada.
3. Nenhuma etapa pode enviar CNPJ, chave NF-e, XML, PFX, senha ou chave privada ao Cloudflare.
4. O limite fiscal exato continua pertencendo ao `FiscalUsageGuard` local e ao `FiscalCoordinator` compartilhado.
5. O rate limiting HTTP serve apenas para reduzir abuso e custo; nunca para contabilidade fiscal.
6. O frontend será refatorado sem mudança deliberada de UX, DOM, fluxo fiscal ou DANFE.
7. Nenhuma biblioteca ou framework novo será introduzido salvo necessidade comprovada e aprovação explícita posterior.
8. Toda mudança de código segue characterization/TDD quando aplicável: teste de regressão ou contrato primeiro, implementação mínima depois.
9. Nenhuma etapa é considerada concluída sem verificação fresca do seu gate técnico.
10. Documentação deve refletir o estado real ao final de cada etapa.
11. Validações externas não podem ser marcadas como concluídas apenas porque o pipeline está preparado.
12. O PR #7 não deve ser mergeado à força sobre a `main`; conteúdo útil deve ser reaplicado seletivamente.

## Escopo

Este roadmap cobre seis frentes encadeadas:

1. proteção HTTP do coordenador fiscal;
2. refatoração incremental de `apps/web/src/main.ts`;
3. proteção administrativa da `main`;
4. ativação e validação de Authenticode quando o certificado real estiver disponível;
5. validação física do fluxo completo em Windows real;
6. preparação e publicação da próxima release patch.

Cada frente deve poder ser revisada, testada e revertida independentemente.

## Fora de escopo

Não fazem parte deste ciclo:

- redesign visual do site;
- migração para React, Vue, Svelte ou outro framework;
- state manager novo;
- substituição do Bridge ou do Portal Helper;
- adoção operacional total de `Unimake.DFe`;
- alteração do DANFE além de correções de regressão comprovadas;
- automação ou bypass de hCaptcha;
- alteração do teto fiscal de 20 tentativas por hora;
- envio de identidade fiscal explícita ao Cloudflare;
- mudança de modelo 55 para incluir NFC-e modelo 65;
- evolução de RTC/IBS/CBS além do parser estrutural já existente sem necessidade real;
- retry fiscal automático após falha ambígua;
- atualização automática de dependências diretamente na `main`;
- reintrodução de servidor central ou compartilhamento LAN.

## Base técnica atual

O projeto já possui:

- consulta individual e em lote;
- Bridge local protegido por loopback, Host/Origin e Named Pipe;
- proteção fiscal local persistente;
- coordenação compartilhada via Durable Object;
- fallback oficial pelo Portal Nacional com hCaptcha manual;
- DANFE A4 coberto por Chromium real no CI;
- suporte a chave de 44 caracteres, inclusive cenário alfanumérico vigente;
- CodeQL para C# e JavaScript/TypeScript;
- Dependabot;
- `npm audit` e NuGet Audit aplicáveis;
- build e empacotamento Windows no CI;
- pipeline já preparado para Authenticode;
- documentação de aceitação física ainda pendente de execução no ambiente real.

O principal débito estrutural de código permanece concentrado em `apps/web/src/main.ts`, enquanto o principal débito de segurança HTTP está antes do acesso ao `FiscalCoordinator` no Worker.

# Fase 0 — Congelar a base e retirar o PR #7 do caminho crítico

## Intenção

Evitar que uma branch antiga e divergente seja usada como base acidental para o restante do trabalho.

## Regras

- registrar o SHA-base da `main` antes do primeiro PR de implementação;
- confirmar CI e CodeQL verdes nesse SHA;
- comparar o PR #7 com a `main` atual;
- reaproveitar somente mudanças que ainda forem compatíveis e necessárias;
- não fazer merge do PR #7 apenas para preservar histórico;
- fechar o PR #7 somente depois de verificar que nenhum conteúdo útil ficou sem destino.

## Saída esperada

Uma base limpa para as fases seguintes, sem código duplicado nem dependência da branch antiga.

# Fase 1 — Hardening HTTP do coordenador fiscal

## Problema

Hoje os endpoints públicos do Worker validam método e bearer, calculam o namespace e acessam o `FiscalCoordinator`. Como o bearer é validado estruturalmente, tráfego abusivo com tokens sintaticamente válidos pode forçar trabalho e criação/acesso de namespaces antes de existir uma barreira de tráfego HTTP.

## Desenho escolhido

Usar o Rate Limiting nativo do Cloudflare Workers como uma barreira global anterior ao acesso do Durable Object fiscal.

A lógica HTTP deve ser extraída para um módulo pequeno e testável, enquanto `worker/index.ts` fica responsável apenas pela integração dos bindings reais.

## Ordem obrigatória do fluxo

```text
requisição /api/fiscal-coordination/*
  -> validar método
  -> validar bearer
  -> validar rota conhecida
  -> consultar rate limiter HTTP
      -> negado: 429 + Retry-After
      -> falha/resultado inválido: 503
      -> permitido: continuar
  -> SHA-256(token)
  -> acessar FiscalCoordinator
  -> executar reserve/block
  -> retornar decisão fiscal existente
```

Rotas não fiscais continuam sendo entregues por `env.ASSETS.fetch(request)`.

## Política inicial

- binding: `COORDINATION_RATE_LIMITER`;
- chave lógica única: `fiscal-coordination`;
- período: 60 segundos;
- limite inicial: 300 requisições por período;
- `429` ao exceder;
- `Retry-After: 60`;
- falha do limiter: `503` fail-safe;
- limiter negado ou indisponível nunca acessa `FiscalCoordinator`.

O valor de 300/min deve permanecer deliberadamente folgado para uso interno legítimo. Qualquer redução futura exige dados reais de uso e novo ajuste explícito.

## Arquivos esperados

- `worker/fiscal-coordination-http.ts`;
- `worker/index.ts`;
- `wrangler.jsonc`;
- `apps/web/tests/fiscal-coordinator-worker.test.ts`;
- `apps/web/tests/deploy-config.test.ts`;
- `docs/architecture/fiscal-usage-guard.md`;
- `README.md`.

## Critérios de aceite

- `401` para bearer inválido sem chamar limiter nem Durable Object;
- `405` para método inválido sem chamar limiter nem Durable Object;
- `404` para rota fiscal desconhecida sem chamar limiter nem Durable Object;
- `429` com `Retry-After` quando o limiter negar;
- `503` quando o limiter falhar ou retornar resposta inválida;
- `reserve` e `block` preservam o comportamento fiscal existente;
- rota não fiscal continua indo para assets;
- nenhum dado fiscal novo é enviado ao Cloudflare;
- `wrangler deploy --dry-run` aceita a configuração;
- suíte web, build, CI e CodeQL ficam verdes.

## Não objetivos da fase

- autenticação nova do bearer;
- WAF, Turnstile ou CAPTCHA;
- armazenar IP;
- segundo Durable Object para rate limiting;
- alterar `FiscalUsageGuard` ou teto fiscal.

# Fase 2 — Refatoração incremental do frontend

## Problema

`apps/web/src/main.ts` concentra bootstrap, UI, Bridge/certificado, consulta individual, lote, fallback Portal, downloads e viewer DANFE. A aplicação funciona, mas o arquivo grande aumenta risco de regressão e dificulta manutenção localizada.

## Estratégia

Characterization-first e extração incremental. Nenhuma etapa altera comportamento observável de propósito.

## Ordem preferida

### 2.1 Lote

Extrair estado e operações do lote para `apps/web/src/batch/controller.ts` ou nome equivalente.

Responsabilidades:

- estado dos itens;
- início/cancelamento;
- transições de status;
- renderização da lista;
- fallback Portal por item;
- ZIP de XMLs;
- impressão de DANFEs;
- habilitação de controles do lote.

### 2.2 Consulta individual

Extrair o fluxo de uma única NF-e para `apps/web/src/nfe/consultation-controller.ts` ou equivalente.

Responsabilidades:

- submit da chave;
- busy state;
- categorias de resposta;
- sucesso/erro;
- download XML;
- ação para abrir DANFE.

### 2.3 Certificado e estado do Bridge

Extrair coordenação visual de certificado para `apps/web/src/bridge/certificate-controller.ts` ou equivalente.

Responsabilidades:

- carregar catálogo;
- selecionar/aplicar certificado;
- estados do Bridge;
- wiring com `BridgeClient` já existente.

A implementação do cliente Bridge e suas regras de segurança não devem ser movidas sem necessidade.

### 2.4 Viewer DANFE

Extrair para `apps/web/src/danfe/viewer.ts` somente se, depois das extrações anteriores, ainda houver concentração relevante no `main.ts`.

Responsabilidades permitidas:

- abrir/fechar modal;
- lifecycle de zoom;
- print;
- troca do conteúdo exibido.

Renderer, paginação e layout fiscal do DANFE permanecem onde estão.

## Estado final esperado de `main.ts`

`main.ts` deve atuar majoritariamente como composition root:

- importar CSS e módulos;
- criar markup raiz existente;
- resolver elementos compartilhados;
- instanciar controladores;
- conectar callbacks entre fluxos;
- executar bootstrap.

Não existe meta artificial de linhas. O critério é separação de responsabilidades.

## Regras de compatibilidade

Durante toda a fase:

- não alterar layout deliberadamente;
- não alterar textos sem necessidade de compatibilidade técnica;
- não alterar IDs/classes DOM usados por testes sem razão aprovada;
- não alterar contratos HTTP;
- não alterar fallback Portal;
- não alterar DANFE;
- não alterar parsing XML;
- não alterar regras fiscais;
- não adicionar dependência nova.

## Testes

Para cada extração:

1. identificar comportamento existente;
2. garantir teste de caracterização/regressão;
3. confirmar baseline verde;
4. extrair responsabilidade;
5. rodar suíte focada;
6. rodar suíte web completa;
7. rodar build e dry-run;
8. rodar DANFE Playwright se o viewer for tocado;
9. seguir para a próxima extração somente depois do gate verde.

# Fase 3 — Proteção administrativa da `main`

## Objetivo

Garantir que nenhum código entre em produção ignorando os gates técnicos já existentes.

## Configuração alvo

Criar ruleset `main-protection` com:

- target: default branch / `main`;
- enforcement: `Active`;
- bloquear exclusão;
- bloquear force push;
- exigir pull request antes de merge;
- zero aprovações humanas obrigatórias é aceitável para manutenção individual;
- exigir resolução de conversas;
- exigir branch atualizada antes do merge;
- exigir os checks:
  - `web`;
  - `danfe-print`;
  - `bridge`;
  - `fiscal-compatibility`;
  - `windows-package`;
- sem bypass normal;
- conta de emergência somente se o proprietário decidir explicitamente configurá-la.

## Validação obrigatória

Abrir um PR pequeno e confirmar na interface real do GitHub que:

- merge fica bloqueado enquanto check obrigatório está pendente;
- merge fica bloqueado quando check obrigatório falha;
- merge fica permitido somente depois das condições satisfeitas.

A proteção da `main` não pode ser declarada concluída apenas pela existência desta spec ou de documentação.

# Fase 4 — Authenticode

## Pré-condição

Esta fase somente pode ser executada quando existir certificado real de code signing com EKU apropriado.

## Pipeline existente a preservar

A assinatura deve continuar restrita a push/release em `main` e nunca disponibilizar secrets em pull request.

Artefatos que precisam ser assinados:

1. `NfeAgendamento.App.exe`;
2. `NfeAgendamento.Bridge.exe`;
3. `NfeAgendamento.Portal.exe`;
4. instalador final Inno Setup.

## Secrets esperados

- `CODE_SIGNING_PFX_BASE64`;
- `CODE_SIGNING_PFX_PASSWORD`.

Preferência: armazenar os secrets em GitHub Environment protegido usado pelo fluxo de publicação.

## Regras de assinatura

- PFX nunca entra no repositório;
- importação temporária no store do usuário;
- chave importada como não exportável quando suportado pelo fluxo atual;
- SHA-256;
- timestamp RFC 3161;
- `signtool verify /pa` obrigatório;
- remoção do material temporário ao final, inclusive em erro.

## Critérios de aceite

Authenticode só está concluído quando uma build/release real do CI produzir os quatro artefatos assinados e verificáveis.

# Fase 5 — Validação física em Windows real

## Objetivo

Cobrir aquilo que CI, mocks e Chromium não conseguem provar.

## Ambiente

Usar pelo menos um computador Windows real com:

- App instalado pelo Setup atual;
- Edge WebView2 Runtime;
- certificado A1 real autorizado para o fluxo;
- acesso ao site oficial;
- acesso à SEFAZ e Portal Nacional;
- impressora real ou destino PDF do Windows, além de ao menos uma validação em papel A4 quando possível.

## Checklist mínimo

### Instalação e App

- instalar sem privilégios administrativos;
- iniciar App;
- confirmar bandeja;
- confirmar Bridge gerenciado pelo App;
- fechar/reabrir;
- reiniciar Windows e confirmar inicialização automática;
- confirmar que atualização manual funciona quando houver versão posterior de teste.

### Certificado

- listar A1 disponível;
- selecionar/aplicar;
- confirmar que site recebe somente metadados permitidos;
- confirmar que PFX, senha e chave privada não deixam o Windows.

### Consulta individual

- chave válida conhecida;
- XML retornado e validado;
- DANFE aberto;
- download XML;
- nova consulta;
- erro funcional conhecido tratado sem retry fiscal automático.

### Lote

- lote pequeno com 2–3 NF-e;
- lote máximo atual com 10 chaves;
- chaves duplicadas/invalidáveis tratadas conforme contrato atual;
- cancelamento;
- ZIP dos XMLs;
- impressão de DANFEs do lote;
- fallback Portal quando ocorrer de forma legítima.

### Portal

- abrir fallback real;
- confirmar host/página oficial;
- resolver hCaptcha manualmente;
- confirmar download oficial do XML;
- validar XML retornado contra a chave consultada;
- confirmar que navegação/download fora do permitido continua bloqueado.

### DANFE

- abrir preview;
- `Ctrl + scroll` afeta somente o viewer;
- DANFE curto em uma página quando couber;
- DANFE longo pagina corretamente;
- cabeçalhos fiscais aparecem nas continuações;
- tabela permanece na grade operacional aprovada de 13 colunas;
- imprimir em A4;
- verificar legibilidade e ausência de overflow/corte no papel/PDF real.

### Falhas e indisponibilidade

- Bridge parado;
- Worker/coordenador indisponível ou resposta inválida;
- internet indisponível;
- certificado indisponível/expirado quando possível testar sem risco;
- confirmar comportamento conservador e mensagens compatíveis com o contrato atual.

## Segurança operacional

Não provocar `cStat 656` ou bloqueio de consumo por repetição artificial de consultas apenas para testar fallback.

## Evidência

Registrar o resultado nos checklists existentes em `docs/testing/`, com data, ambiente e observações suficientes para distinguir item testado de item não testado.

# Fase 6 — Documentação e próxima release

## Pré-condições

A próxima release só deve ser preparada depois que:

- Fase 1 estiver implementada e verde;
- Fase 2 estiver concluída ou explicitamente adiada com justificativa registrada;
- Fase 3 tiver sido validada no GitHub real;
- Fase 4 estiver concluída se o certificado de assinatura estiver disponível; se não estiver, a release deve declarar explicitamente a pendência;
- Fase 5 tiver seus resultados documentados.

## Versão

Se não houver mudança funcional incompatível nem nova feature, a próxima versão esperada é uma patch após `0.0.14`, portanto `0.0.15`.

A versão só deve ser fixada no plano de implementação final se a `main` ainda estiver em `0.0.14` naquele momento.

## Documentação a revisar

No fechamento do ciclo, revisar pelo menos:

- `README.md`;
- `docs/architecture/fiscal-usage-guard.md`;
- `docs/operations/repository-hardening.md`;
- `docs/testing/acceptance.md`;
- `docs/testing/batch-query.md`;
- `docs/testing/danfe-layout.md`;
- `docs/testing/portal-post-hcaptcha.md`;
- `docs/testing/bridge-updater.md`;
- documentação da nova divisão estrutural do frontend;
- `docs/releases/v0.0.15.md` se essa continuar sendo a próxima versão correta.

## Fluxo de release

1. atualizar versão canônica;
2. atualizar documentação e notas de release;
3. commit final `release: v<versão>`;
4. aguardar CI completo;
5. aguardar CodeQL aplicável;
6. publicar somente os artifacts produzidos pelo mesmo SHA validado;
7. verificar release, assets, hash e assinatura quando Authenticode estiver ativo.

# Estratégia de branches e PRs

O roadmap não deve virar um único PR gigante.

Ordem recomendada:

1. PR A — hardening HTTP do Worker;
2. PR B — extração do lote;
3. PR C — consulta individual;
4. PR D — certificado/Bridge UI;
5. PR E — viewer DANFE, somente se ainda necessário;
6. configuração administrativa da `main` fora de código;
7. configuração Authenticode quando possível;
8. PR final de documentação/release.

Cada PR de código deve partir da `main` atualizada depois do merge anterior.

Se uma extração do frontend mostrar risco ou dependência oculta, parar e reavaliar antes de combinar múltiplos módulos no mesmo PR.

# Relação com o PR #7

O PR #7 contém material útil, incluindo:

- design e implementação preliminar do rate limiting;
- testes do handler do Worker;
- configuração `ratelimits` do Wrangler;
- designs de refatoração do frontend;
- design de proteção da `main` e Authenticode.

Esse material deve ser tratado como referência, não como base automática.

Antes de fechar o PR #7:

- confirmar que o hardening HTTP útil foi reaplicado no PR A;
- confirmar que a estratégia de frontend foi incorporada aos PRs B–E;
- confirmar que os controles externos estão preservados na documentação vigente;
- somente então fechar o PR #7 como supersedido.

# Gates de qualidade

## Gate por PR de código

- teste RED/regressão comprovada quando aplicável;
- implementação mínima;
- suíte focada;
- suíte web/.NET aplicável;
- lint e format check;
- build;
- `wrangler deploy --dry-run` quando Worker/web for tocado;
- Playwright A4 quando DANFE/viewer for tocado;
- CI completo;
- CodeQL;
- revisão do diff;
- documentação atualizada.

## Gate antes de release

- CI completo verde no SHA candidato;
- CodeQL verde no SHA aplicável;
- checklists físicos atualizados;
- estado da proteção da `main` documentado;
- estado do Authenticode documentado;
- release notes completas;
- artifacts pertencentes ao mesmo SHA validado.

# Critérios de conclusão do roadmap

O ciclo só pode ser declarado concluído quando:

- o coordenador fiscal possuir barreira HTTP antes do Durable Object;
- `main.ts` tiver responsabilidades significativamente reduzidas sem regressão funcional;
- a `main` estiver realmente protegida por ruleset validado;
- Authenticode estiver realmente validado, se o certificado tiver sido disponibilizado, ou continuar explicitamente marcado como pendência externa;
- os fluxos físicos essenciais tiverem evidência registrada;
- documentação estiver coerente com o estado real;
- próxima release tiver sido gerada e publicada a partir de SHA validado;
- o PR #7 antigo tiver destino definido e não permanecer como dívida ambígua.

# Riscos e mitigação

## Rate limiter interferir em uso legítimo

Mitigação: limite inicial folgado, chave global apenas para proteção de abuso e teto fiscal separado no Durable Object.

## Refatoração do frontend alterar comportamento

Mitigação: characterization-first, uma extração por vez, PRs pequenos e nenhum redesign junto.

## Divergência entre documentação e realidade externa

Mitigação: ruleset e Authenticode só mudam para “concluído” após validação real.

## Teste físico provocar bloqueio fiscal

Mitigação: usar cenários reais de baixo risco e nunca tentar causar `656` artificialmente.

## PR #7 carregar código desatualizado

Mitigação: reaplicar seletivamente sobre a `main`, sem merge forçado.

# Decisão final de arquitetura

A arquitetura atual permanece.

Não há justificativa, neste ciclo, para substituir Cloudflare, Bridge local, WebView2, Durable Object ou o modelo de certificado por PC. O valor deste roadmap está em endurecer, separar responsabilidades e validar operacionalmente o que já existe, não em aumentar a complexidade do sistema.
