# Tela de consulta

Estado atual da interface principal do NFe Agendamento 2.0.

## Barra superior

A área de ações do canto superior direito contém, nesta ordem:

1. status do Bridge local;
2. atalho quadrado **Baixar app para Windows**;
3. botão quadrado de **Configurações**.

O atalho de download aponta diretamente para o Setup da versão canônica atualmente publicada (`v0.0.7`). O teste `apps/web/tests/settings-panel.test.ts` cruza a URL do Setup com `Directory.Build.props`, para que um futuro bump de versão não deixe o link silenciosamente desatualizado.

## Consulta e resultado

A tela principal usa um único card visual. O formulário da chave de acesso e o resultado da consulta ficam dentro do mesmo container, separados apenas por uma divisória interna.

Os controles principais da consulta ficam imediatamente abaixo do campo da chave, agrupados no lado esquerdo na ordem **Nova consulta** → **Consultar**. Em telas menores, os dois permanecem lado a lado em duas colunas de largura equivalente.

O estado inicial continua informando que nenhuma NF-e foi carregada. Depois que uma consulta é iniciada, o botão **Nova consulta** fica disponível. Ele permanece desabilitado enquanto uma operação está em andamento e, quando acionado após a conclusão, limpa a chave digitada, remove o resultado/DANFE/XML temporário, restaura o estado inicial e devolve o foco ao campo da chave.

A mudança de posicionamento reutiliza os mesmos botões e os mesmos event listeners já existentes; nenhum comportamento de consulta, reset, SEFAZ, Portal, certificado ou DANFE foi alterado.

## Configurações

A seleção do certificado A1 continua fora da tela principal e é movida para o painel aberto pela engrenagem. Nenhum comportamento fiscal, endpoint do Bridge ou fluxo SEFAZ/Portal foi alterado por esta mudança de interface.

## Arquivos relacionados

- `apps/web/src/main.ts`
- `apps/web/src/styles.css`
- `apps/web/src/consultation-actions.ts`
- `apps/web/src/consultation-actions.css`
- `apps/web/src/settings-panel.ts`
- `apps/web/src/settings-panel.css`
- `apps/web/tests/theme.test.ts`
- `apps/web/tests/consultation-actions.test.ts`
- `apps/web/tests/settings-panel.test.ts`
