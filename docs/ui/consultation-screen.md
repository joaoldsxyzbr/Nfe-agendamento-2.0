# Tela de consulta

Estado atual da interface principal do NFe Agendamento 2.0 na `main`.

## Barra superior

A área de ações do canto superior direito contém, nesta ordem:

1. status do Bridge local;
2. atalho quadrado **Baixar app para Windows**;
3. botão quadrado de **Configurações**.

O atalho de download aponta para o Setup da versão canônica publicada (`v0.0.13`). O teste `apps/web/tests/settings-panel.test.ts` cruza a URL do Setup com `Directory.Build.props`, para que um futuro bump de versão não deixe o link silenciosamente desatualizado.

O cabeçalho usa um único bloco visual à esquerda: símbolo da aplicação e, ao lado, o nome quebrado em duas linhas, **NF-e** e **Agendamento**, separados por uma divisória vertical discreta. A frase de apoio fica logo abaixo do conjunto.

## Identidade visual

A marca usa azul vibrante e amarelo vibrante, com fundo transparente e símbolo composto por documento NF-e, relógio/agendamento e confirmação.

- no cabeçalho, o símbolo fica em `apps/web/public/brand-mark.png`;
- o nome **NF-e / Agendamento** existe como conteúdo real dentro do `<h1>`;
- a aba usa `apps/web/public/favicon.ico`;
- App/Bridge Windows usam `apps/bridge/assets/nfe-agendamento-bridge.ico`.

## Modos de consulta

A tela principal possui alternância **Uma NF-e | Lote** no card de consulta. O modo Lote entrou na release pública v0.0.13.

Trocar o modo não muda certificado, Bridge, regras do DANFE ou segurança fiscal. Durante uma operação ativa, a alternância fica bloqueada para evitar duas rotas concorrentes pela mesma tela.

## Consulta única

O formulário da chave e o resultado continuam no mesmo card visual. Os controles ficam agrupados abaixo do campo na ordem **Nova consulta** → **Consultar**.

O estado inicial informa que nenhuma NF-e foi carregada. Depois de uma consulta, **Nova consulta** limpa chave, resultado, DANFE/XML temporário e devolve foco ao campo.

### Retorno de NF-e cancelada

Quando a consulta direta retorna `fiscal_status` com `cStat 653`, a interface apresenta:

- título **NF-e cancelada**;
- mensagem informando que o XML não está disponível;
- código **SEFAZ 653** como informação técnica.

O `cStat 217` continua elegível ao fallback Portal Nacional.

## Consulta em lote

O modo **Lote** aceita até 10 NF-e por execução e processa uma por vez.

### Entrada

A área contém:

- textarea para colar chaves;
- aceitação de chaves em linhas separadas, com vírgula ou ponto e vírgula, além de chave formatada com separadores;
- validação local do DV;
- remoção de duplicadas válidas;
- resumo `válidas · inválidas · duplicadas`;
- botão **Iniciar lote**.

Com mais de 10 chaves válidas, **Iniciar lote** permanece desabilitado e o resumo informa o limite.

As chaves válidas aparecem abaixo do campo **antes de iniciar**, preservando a ordem original.

### Linha de cada NF-e

Cada linha contém:

- número de ordem;
- chave abreviada visualmente, com a chave completa associada ao elemento;
- status atual;
- origem `SEFAZ` ou `Portal` quando concluída;
- número/série, emitente e valor depois que o XML é carregado;
- **Visualizar DANFE**;
- **Baixar XML**.

Enquanto não existe XML validado, as duas ações ficam desabilitadas. Assim que aquela linha conclui, ficam disponíveis imediatamente, mesmo que o restante do lote ainda esteja processando.

**Visualizar DANFE** reutiliza o mesmo modal da consulta única, incluindo `Ctrl + scroll`, impressão/PDF e regras específicas de fornecedores.

### Progresso e ações gerais

O bloco do lote mostra `concluídos/total`, rota atual e:

- **Cancelar lote**;
- **Baixar XMLs (.zip)**;
- **Imprimir DANFEs**.

ZIP e impressão usam somente NF-e concluídas. Cancelar não apaga resultados já concluídos.

### Fluxo híbrido SEFAZ → Portal

O lote começa pela SEFAZ e nunca processa duas chaves em paralelo.

- sucesso direto: a linha conclui com origem **SEFAZ**;
- `217`: somente aquela linha usa Portal, depois a fila pode voltar à SEFAZ;
- `656`, HTTP 429 ou `consumption_limit`: a proteção fiscal local é ativada e o restante do lote segue pelo **Portal**, uma chave por vez;
- hCaptcha continua sendo resolvido manualmente em cada operação Portal;
- erro ambíguo de transporte não é repetido automaticamente;
- falha Portal deixa a linha em erro e oferece ação manual **Tentar pelo Portal**.

Detalhes de arquitetura e aceitação: `docs/superpowers/specs/2026-09-14-batch-query-design.md` e `docs/testing/batch-query.md`.

## Configurações

A seleção do certificado A1 continua fora da área principal e fica no painel aberto pela engrenagem.

Desde a v0.0.12, o painel também contém **Diagnóstico local**. Ao abrir Configurações ou clicar em **Atualizar**, o site consulta `/api/v1/health` e apresenta:

- conexão do Bridge;
- versão do Bridge;
- existência de certificado A1 selecionado;
- disponibilidade do Portal/WebView2;
- horário da última verificação;
- último erro da própria verificação.

O diagnóstico não lê PFX, senha, chave privada ou XML. Mensagens exibidas removem sequências de 44 dígitos para evitar exposição acidental de chave NF-e.

## Dados temporários

Tanto na consulta única quanto no lote, XML/DANFE ficam em memória no navegador. Recarregar/fechar a página descarta esses resultados. O Bridge não é usado como armazenamento de XML.

## Arquivos relacionados

- `apps/web/index.html`
- `apps/web/src/main.ts`
- `apps/web/src/styles.css`
- `apps/web/src/batch.css`
- `apps/web/src/batch/input.ts`
- `apps/web/src/batch/zip.ts`
- `apps/web/src/consultation-actions.ts`
- `apps/web/src/settings-panel.ts`
- `apps/web/src/danfe/render.ts`
- `apps/web/tests/batch-input.test.ts`
- `apps/web/tests/batch-zip.test.ts`
- `apps/web/tests/shell.test.ts`
- `docs/testing/batch-query.md`
