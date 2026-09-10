# Tela de consulta

Estado atual da interface principal do NFe Agendamento 2.0.

## Barra superior

A área de ações do canto superior direito contém, nesta ordem:

1. status do Bridge local;
2. atalho quadrado **Baixar app para Windows**;
3. botão quadrado de **Configurações**.

O atalho de download aponta diretamente para o Setup da versão canônica atualmente publicada (`v0.0.8`). O teste `apps/web/tests/settings-panel.test.ts` cruza a URL do Setup com `Directory.Build.props`, para que um futuro bump de versão não deixe o link silenciosamente desatualizado.

O cabeçalho usa um único bloco visual à esquerda: símbolo da aplicação e, ao lado, o nome quebrado em duas linhas, **NF-e** e **Agendamento**, separados por uma divisória vertical discreta. A frase de apoio fica logo abaixo do conjunto. O grupo de ações da direita é alinhado visualmente ao centro desse bloco de marca em desktop.

## Identidade visual

A marca atual usa azul vibrante e amarelo vibrante, com fundo transparente e símbolo composto por documento NF-e, relógio/agendamento e confirmação.

- no cabeçalho do site, o símbolo transparente fica em `apps/web/public/brand-mark.png` e é renderizado como imagem decorativa;
- o nome **NF-e** / **Agendamento** existe como conteúdo real dentro do `<h1>`, em duas `<span>`, preservando semântica e acessibilidade; `apps/web/src/brand.css` cuida somente da apresentação;
- a aba do navegador usa somente o símbolo, sem o nome, em `apps/web/public/favicon.ico`;
- App/Bridge Windows usam somente o mesmo símbolo, sem o nome, em `apps/bridge/assets/nfe-agendamento-bridge.ico`.

## Refinamentos visuais

A tela foi compactada sem alterar comportamento funcional:

- o conjunto logo + nome foi levemente reduzido e aproximado, diminuindo o espaço ocioso no topo;
- a distância entre o cabeçalho e o card principal foi reduzida;
- o estado vazio do resultado ocupa menos altura, e o card cresce naturalmente quando houver conteúdo;
- o indicador **44 dígitos** ganhou menor peso visual por ser informação secundária;
- o texto auxiliar sobre processamento/Bridge recebeu contraste e legibilidade um pouco maiores;
- as ações do canto superior direito foram reposicionadas para ficar visualmente alinhadas com a marca em telas desktop.

## Consulta e resultado

A tela principal usa um único card visual. O formulário da chave de acesso e o resultado da consulta ficam dentro do mesmo container, separados apenas por uma divisória interna.

Os controles principais da consulta ficam imediatamente abaixo do campo da chave, agrupados no lado esquerdo na ordem **Nova consulta** → **Consultar**. Em telas menores, os dois permanecem lado a lado em duas colunas de largura equivalente.

O estado inicial continua informando que nenhuma NF-e foi carregada. Depois que uma consulta é iniciada, o botão **Nova consulta** fica disponível. Ele permanece desabilitado enquanto uma operação está em andamento e, quando acionado após a conclusão, limpa a chave digitada, remove o resultado/DANFE/XML temporário, restaura o estado inicial e devolve o foco ao campo da chave.

Os refinamentos visuais descritos acima não alteram o comportamento de consulta, reset, SEFAZ, Portal, certificado ou DANFE.

### Retorno de NF-e cancelada

Quando a consulta direta retorna `fiscal_status` com `cStat 653`, a interface apresenta um aviso amigável em vez do título genérico **Resultado fiscal**:

- título: **NF-e cancelada**;
- mensagem: informa que a nota foi cancelada na SEFAZ e que o XML não está disponível para download;
- o código **SEFAZ 653** permanece visível como informação técnica secundária.

O retorno `fiscal_status` com `cStat 217` é a exceção operacional: ele aciona o fallback pelo Portal Nacional porque a consulta direta pode não disponibilizar o XML mesmo quando o documento é obtido pelo Portal. Os demais `fiscal_status` continuam usando o tratamento genérico existente. O aviso específico de `653` continua sendo somente de apresentação.

## Configurações

A seleção do certificado A1 continua fora da tela principal e fica no painel aberto pela engrenagem. Nenhum comportamento fiscal, endpoint do Bridge ou fluxo SEFAZ/Portal foi alterado por esta mudança de interface.

## Arquivos relacionados

- `apps/web/index.html`
- `apps/web/public/brand-mark.png`
- `apps/web/public/favicon.ico`
- `apps/web/src/brand.css`
- `apps/web/src/main.ts`
- `apps/web/src/styles.css`
- `apps/web/src/consultation-actions.ts`
- `apps/web/src/consultation-actions.css`
- `apps/web/src/settings-panel.ts`
- `apps/web/src/settings-panel.css`
- `apps/web/tests/shell.test.ts`
- `apps/web/tests/theme.test.ts`
- `apps/web/tests/consultation-actions.test.ts`
- `apps/web/tests/settings-panel.test.ts`
- `apps/bridge/assets/nfe-agendamento-bridge.ico`
