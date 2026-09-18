# Fronteiras do frontend

Estado atual após a rodada de hardening de setembro de 2026.

O frontend continua sendo um site Vite + TypeScript. A arquitetura funcional não mudou: o navegador compõe a interface e o DANFE, enquanto o Bridge local executa as operações que dependem do Windows, certificado A1 e acesso fiscal.

## Composition root

`apps/web/src/main.ts` é o composition root da aplicação.

Ele mantém:

- markup principal e referências dos elementos da página;
- criação e injeção das dependências dos controladores;
- alternância visual entre consulta unitária e lote;
- renderização dos estados/resultados da consulta na tela;
- criação do link de download XML;
- wiring de lifecycle global da página.

Ele não deve concentrar novamente o estado interno dos fluxos já extraídos.

## Consulta em lote

`apps/web/src/batch/controller.ts` possui o estado e o ciclo do lote:

- validação e fila visual das chaves;
- processamento serial;
- mudança legítima da rota SEFAZ para Portal;
- cancelamento;
- resolução local de fornecedor após o parse;
- ZIP dos XMLs concluídos;
- impressão de múltiplos DANFEs.

O controller recebe Bridge, Portal, parser, viewer e ações de download por injeção. Ele não importa estado global de `main.ts`.

## Consulta unitária

`apps/web/src/nfe/consultation-controller.ts` possui o fluxo de uma NF-e:

- validação da chave antes do Bridge;
- consulta direta;
- fallback elegível para o Portal em `consumption_limit` ou `cStat 217`;
- parse/validação do XML;
- resolução local de fornecedor em modo fail-soft;
- estados terminais e busy state;
- ownership da operação Portal ativa e cancelamento best-effort.

A apresentação do resultado continua em callbacks fornecidos pelo composition root.

## Bridge e certificado A1

`apps/web/src/bridge/certificate-controller.ts` possui a coordenação visual de Bridge/certificado:

- health check do Bridge;
- distinção entre conectado, ausente e permissão de rede local bloqueada;
- catálogo de certificados A1 utilizáveis;
- seleção do thumbprint;
- habilitação/desabilitação dos controles.

O controller nunca recebe PFX, senha ou chave privada. O contrato do site continua limitado aos metadados públicos já expostos pelo Bridge e ao thumbprint.

## Viewer DANFE

`apps/web/src/danfe/viewer.ts` possui somente o lifecycle do modal:

- renderização dos documentos recebidos;
- abrir/fechar;
- lifecycle do zoom;
- fechamento por Escape e clique no backdrop;
- impressão;
- limpeza ao descartar o viewer.

O renderer fiscal continua em `apps/web/src/danfe/render.ts`. Regras de layout, paginação, grade de produtos e dados fiscais não foram movidas para o viewer.

## Demais módulos

- `apps/web/src/nfe/xml.ts`: parse estrutural e validação do XML contra a chave esperada.
- `apps/web/src/nfe/access-key.ts`: validação local da chave NF-e e DV.
- `apps/web/src/nfe/supplier-rules.ts`: escolha das regras de apresentação do fornecedor por id lógico e fallback transitório por nome.
- `apps/web/src/portal/fallback.ts`: polling/cancelamento da operação Portal exposta pelo Bridge.
- `apps/web/src/bridge/client.ts`: cliente HTTP do Bridge loopback e validação dos contratos de resposta.
- `apps/web/src/danfe/render.ts`: renderer/paginação do DANFE e zoom das páginas.

## Regra de manutenção

Novas responsabilidades devem permanecer no módulo que já é dono do fluxo. `main.ts` deve ser tratado como composition root, não como local padrão para lógica de negócio.

As extrações acima são estruturais. Elas não mudaram a arquitetura site + App/Bridge por PC + helper Portal + Worker/Durable Object.
