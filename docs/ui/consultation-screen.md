# Tela de consulta

Estado atual da interface principal do NFe Agendamento 2.0 na `main`.

## Barra superior

A área de ações do canto superior direito contém, nesta ordem:

1. status do Bridge local;
2. atalho quadrado **Baixar app para Windows**;
3. botão quadrado de **Configurações**.

O atalho de download acompanha a versão canônica configurada no repositório. O teste `apps/web/tests/settings-panel.test.ts` cruza a URL do Setup com `Directory.Build.props`, evitando que um bump de versão deixe o link silenciosamente desatualizado.

O cabeçalho usa um único bloco visual à esquerda: símbolo da aplicação e, ao lado, o nome quebrado em duas linhas, **NF-e** e **Agendamento**, separados por uma divisória vertical discreta. A frase de apoio fica logo abaixo do conjunto.

## Identidade visual e tipografia

A marca usa azul vibrante e amarelo vibrante, com fundo transparente e símbolo composto por documento NF-e, relógio/agendamento e confirmação.

- no cabeçalho, o símbolo fica em `apps/web/public/brand-mark.png`;
- o nome **NF-e / Agendamento** existe como conteúdo real dentro do `<h1>`;
- a aba usa `apps/web/public/favicon.ico`;
- App/Bridge Windows usam `apps/bridge/assets/nfe-agendamento-bridge.ico`.

A interface usa uma pilha tipográfica local, sem dependência de fonte web externa:

- texto geral: **Segoe UI Variable Text**, com fallback para Segoe UI, Roboto, Helvetica Neue e Arial;
- títulos: **Segoe UI Variable Display**, com fallbacks equivalentes;
- chaves NF-e: **Cascadia Mono / Cascadia Code**, com fallback para Consolas e outras monoespaçadas.

Isso mantém o visual mais moderno especialmente no Windows atual sem adicionar download de fonte, dependência externa ou impacto no funcionamento offline/local.

## Consulta unificada

A interface visível não possui mais a alternância **Uma NF-e | Lote**.

Existe um único campo de consulta:

- com uma chave válida, o fluxo processa uma NF-e;
- com várias chaves válidas, o mesmo fluxo monta a lista e processa uma NF-e por vez;
- duplicadas e inválidas continuam sendo contabilizadas antes da consulta;
- existe teto operacional de **100 NF-e válidas por lote** para evitar crescimento ilimitado de memória no navegador;
- certificado, Bridge, DANFE, fallback e proteção fiscal continuam compartilhando as mesmas regras.

O fluxo visível reutiliza o orquestrador sequencial já usado pelo lote. O endpoint fiscal continua unitário: cada NF-e é consultada individualmente, sem chamada fiscal paralela.

### Ações principais

As ações ficam alinhadas à esquerda.

Com zero ou uma chave válida, o comportamento replica a antiga consulta única:

- antes de consultar, aparece somente **Consultar**;
- durante a consulta, **Consultar** permanece no mesmo lugar e fica indisponível;
- quando a tentativa termina, **Consultar** é substituído por **Nova consulta** no mesmo lugar;
- **Nova consulta** limpa a entrada e o resultado, devolve o foco ao campo e faz **Consultar** reaparecer.

Se o usuário editar a chave depois de uma consulta concluída, a tela também volta ao estado inicial com **Consultar**.

Com duas ou mais chaves válidas, a interface mantém as ações **Consultar** e **Nova consulta** disponíveis lado a lado, preservando o fluxo de múltiplas NF-e. Durante uma operação ativa, **Nova consulta** fica indisponível para não alterar a fila em processamento.

## Entrada

A área contém:

- textarea para colar uma ou várias chaves;
- aceitação de chaves em linhas separadas, com vírgula ou ponto e vírgula, além de chave formatada com separadores;
- validação local do DV;
- remoção de duplicadas válidas;
- resumo `válidas · inválidas · duplicadas`;
- botão **Consultar**.

As chaves válidas aparecem abaixo do campo antes de iniciar, preservando a ordem original.

### Modo compacto para uma NF-e

Quando a entrada contém zero ou uma chave válida, a própria interface aplica um layout compacto para reduzir a altura da página:

- o campo de chave reduz para a altura necessária a uma única linha;
- o texto auxiliar detalhado é ocultado;
- margens e espaçamentos do formulário, progresso e linha de resultado ficam menores;
- **Baixar XMLs (.zip)** e **Imprimir DANFEs** ficam ocultos, pois são ações de várias NF-e;
- **Consultar** aparece antes da execução e é substituído por **Nova consulta** quando a tentativa termina;
- **Visualizar DANFE** e **Baixar XML** continuam disponíveis normalmente quando existe XML validado.

Quando a única NF-e termina, o card mantém a mesma estrutura visual usada durante o processamento. A linha não é recolhida e a barra de progresso não desaparece; apenas status, detalhes e disponibilidade das ações são atualizados. Isso evita mudança de altura e reposicionamento do conteúdo após a conclusão.

Ao informar duas ou mais chaves válidas, a tela volta automaticamente ao layout expandido e exibe novamente as ações coletivas. A mudança de compactação é somente visual, controlada pela classe `is-compact-single`; processamento, fila, fallback e proteção fiscal não são alterados.

## Linha de cada NF-e

No fluxo com várias NF-e, cada linha contém:

- número de ordem;
- chave abreviada visualmente, com a chave completa associada ao elemento;
- status atual;
- origem `SEFAZ` ou `Portal` quando concluída;
- número/série, emitente e valor depois que o XML é carregado;
- **Visualizar DANFE**;
- **Baixar XML**.

Enquanto não existe XML validado, as duas ações ficam desabilitadas. Assim que aquela linha conclui, ficam disponíveis imediatamente, mesmo que outras NF-e ainda estejam processando.

**Visualizar DANFE** reutiliza o mesmo modal existente, incluindo `Ctrl + scroll`, impressão/PDF e regras específicas de fornecedores.

## Progresso e ações gerais

O bloco de processamento mostra `concluídos/total`, rota atual e:

- **Cancelar lote** somente durante o processamento; o atributo `hidden` possui regra CSS explícita para não ser sobreposto pelo estilo genérico dos botões;
- **Baixar XMLs (.zip)**;
- **Imprimir DANFEs**.

ZIP e impressão usam somente NF-e concluídas. Cancelar não apaga resultados já concluídos. No modo compacto de uma NF-e, ZIP e impressão conjunta são ocultados por não trazerem benefício para uma única nota. O bloco de progresso permanece visível depois da conclusão para preservar a estrutura estática do card.

## Fluxo híbrido SEFAZ → Portal

A consulta começa pela SEFAZ e nunca processa duas chaves em paralelo.

- sucesso direto: a linha conclui com origem **SEFAZ**;
- `217`: somente aquela linha usa Portal, depois a fila pode voltar à SEFAZ;
- `656`, HTTP 429 ou `consumption_limit`: a proteção fiscal local é ativada e as chaves restantes seguem pelo **Portal**, uma por vez;
- hCaptcha continua sendo resolvido manualmente em cada operação Portal;
- erro ambíguo de transporte não é repetido automaticamente;
- falha Portal deixa a linha em erro e oferece ação manual **Tentar pelo Portal**.

O teto de 100 é apenas operacional e não altera a proteção fiscal. O processamento continua sequencial, sujeito ao hCaptcha e ao comportamento do Portal Nacional.

Detalhes de arquitetura e aceitação: `docs/superpowers/specs/2026-09-14-batch-query-design.md` e `docs/testing/batch-query.md`.

## Configurações

A seleção do certificado A1 continua fora da área principal e fica no painel aberto pela engrenagem.

Desde a v0.0.12, o painel também contém **Diagnóstico local**. Na migração site-first, ao abrir Configurações ou clicar em **Atualizar**, o site consulta `/api/v1/health` e apresenta:

- conexão do componente local;
- versão do Bridge;
- existência de certificado A1 selecionado;
- disponibilidade do Portal/WebView2;
- horário da última verificação;
- último erro da própria verificação;
- atualização disponível do componente Windows, quando a metadata oficial indicar versão mais nova.

A verificação de atualização usa `/api/update/latest` e só aceita o Setup versionado servido pelo domínio oficial. Falha da fonte de atualização não transforma um Bridge saudável em erro.

Quando o acesso a `127.0.0.1` falha sem sinal suficiente do navegador, a UI informa de forma conservadora que o componente pode estar parado **ou** que a permissão de rede local pode estar bloqueada; ela não inventa uma causa específica.

O diagnóstico não lê PFX, senha, chave privada ou XML. Mensagens exibidas removem sequências de 44 caracteres alfanuméricos para evitar exposição acidental de chave NF-e.

## Componente Windows

Desde a v0.0.20, o site é a única interface normal do produto e o Windows executa diretamente `NfeAgendamento.Bridge.exe`:

- sem App de bandeja;
- sem menu ou UI própria de atualização;
- sem `--managed`, lease ou heartbeat;
- com instância única pelo mutex do Bridge;
- helper Portal aberto somente quando necessário;
- diagnóstico e atualização apresentados pelo site.

## Dados temporários

XML/DANFE ficam em memória no navegador. Recarregar/fechar a página descarta esses resultados. O Bridge não é usado como armazenamento de XML.

## Arquivos relacionados

- `apps/web/index.html`
- `apps/web/src/main.ts`
- `apps/web/src/styles.css`
- `apps/web/src/batch.css`
- `apps/web/src/batch/input.ts`
- `apps/web/src/batch/ui.ts`
- `apps/web/src/batch/zip.ts`
- `apps/web/src/consultation-actions.ts`
- `apps/web/src/settings-panel.ts`
- `apps/web/src/danfe/render.ts`
- `apps/web/tests/batch-input.test.ts`
- `apps/web/tests/batch-zip.test.ts`
- `apps/web/tests/shell.test.ts`
- `tests/playwright/consultation-flow.spec.ts`
- `docs/testing/batch-query.md`
