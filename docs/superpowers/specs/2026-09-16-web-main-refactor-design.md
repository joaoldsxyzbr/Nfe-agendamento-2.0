# Web Main Refactor Design

## Objetivo

Reduzir a concentração de responsabilidades em `apps/web/src/main.ts` sem alterar comportamento, layout, contratos com Bridge/Portal ou regras fiscais.

## Escopo

Esta especificação cobre somente a refatoração estrutural do frontend existente. Não adiciona funcionalidades, não altera UX e não modifica Worker, Bridge, Portal, DANFE fiscal ou contratos HTTP.

## Estado atual

`apps/web/src/main.ts` possui aproximadamente 39 KiB e concentra bootstrap da tela, consulta individual, processamento em lote, renderização de estados, integração com certificado/Bridge, fallback Portal, downloads e controle do modal DANFE.

O projeto já possui módulos dedicados para `batch`, `bridge`, `portal`, `nfe`, `danfe` e configurações. A refatoração deve aproveitar essas fronteiras existentes em vez de criar uma nova arquitetura.

## Princípios

1. Refatorar de forma incremental, uma responsabilidade por vez.
2. Preservar comportamento observável e DOM existente.
3. Não introduzir framework novo, state manager ou dependência adicional.
4. Manter `main.ts` como composition root/bootstrap.
5. Extrair lógica apenas quando existir uma fronteira funcional clara.
6. Cada extração deve possuir teste/regressão correspondente antes de seguir para a próxima.
7. Não alterar regras fiscais, parsing XML, DANFE, Bridge ou Portal durante esta refatoração.

## Ordem de extração

### 1. Fluxo de lote

Extrair estado e operações específicas de consulta em lote para um controlador dedicado em `apps/web/src/batch/`.

Responsabilidades do módulo:

- estado dos itens do lote;
- início/cancelamento;
- transições de status;
- renderização da lista do lote;
- retry manual pelo Portal;
- download ZIP;
- impressão de DANFEs do lote;
- habilitação/desabilitação dos controles próprios do lote.

O módulo recebe dependências por parâmetros/callbacks em vez de importar estado global do `main.ts`.

### 2. Consulta individual

Extrair o fluxo de uma única NF-e para módulo dedicado em `apps/web/src/nfe/` ou diretório equivalente já existente.

Responsabilidades:

- submit da chave;
- estado busy;
- tratamento das categorias de resposta;
- renderização de sucesso/falha;
- ações de visualizar DANFE e baixar XML.

### 3. Certificado e Bridge

Extrair apenas a camada de UI/coordenação de certificado que ainda permanecer no `main.ts` após as duas primeiras etapas.

Responsabilidades:

- catálogo de certificados;
- seleção/aplicação;
- estados `checking`, `connected`, `missing`, `permission`;
- wiring com cliente Bridge existente.

Não mover implementação do cliente Bridge nem regras de segurança já encapsuladas.

### 4. Viewer DANFE

Somente se ainda houver concentração relevante no `main.ts`, extrair o controle de abrir/fechar viewer e lifecycle do zoom. O renderer e paginação DANFE permanecem onde estão.

## Composition root final

Ao final, `main.ts` deve principalmente:

- importar CSS e módulos;
- criar/injetar o markup raiz existente;
- resolver elementos DOM compartilhados;
- construir os controladores;
- conectar eventos de alto nível entre módulos;
- executar bootstrap inicial.

Não existe meta artificial de número de linhas. A refatoração termina quando as responsabilidades estiverem claras e mudanças futuras puderem ser feitas sem percorrer um arquivo monolítico.

## Testes

A estratégia é characterization-first:

1. identificar comportamentos existentes de cada fluxo;
2. adicionar/ajustar testes que capturem esses comportamentos;
3. executar testes e confirmar baseline verde;
4. extrair o módulo sem mudar resultado observável;
5. executar novamente a suíte focada e a suíte web completa;
6. somente então seguir para a extração seguinte.

Além dos testes unitários atuais, o build Vite e `wrangler deploy --dry-run` devem continuar passando. A regressão Playwright de DANFE deve ser executada quando o wiring do viewer for tocado.

## Arquivos previstos

A lista exata será definida no plano de implementação após leitura detalhada do `main.ts`, mas a estrutura preferida é:

- `apps/web/src/batch/controller.ts` para coordenação do lote;
- `apps/web/src/nfe/consultation-controller.ts` para consulta individual;
- `apps/web/src/bridge/certificate-controller.ts` para UI do certificado;
- `apps/web/src/danfe/viewer.ts` apenas se necessário;
- `apps/web/src/main.ts` reduzido ao bootstrap/composição;
- testes correspondentes em `apps/web/tests/`.

## Critérios de aceite

- nenhuma mudança visual deliberada;
- nenhuma mudança de contrato HTTP;
- nenhuma mudança nas regras de fallback Portal;
- nenhuma mudança no DANFE gerado;
- nenhuma mudança no tratamento fiscal;
- todos os testes web existentes continuam passando;
- testes adicionados para as fronteiras extraídas passam;
- build web e dry-run do Wrangler passam;
- CodeQL continua sem novo alerta introduzido pela refatoração;
- documentação técnica atualizada para refletir a nova divisão de responsabilidades.

## Não objetivos

- migrar para React/Vue/Svelte;
- adicionar framework de estado;
- redesenhar a tela;
- alterar CSS sem necessidade direta da extração;
- otimização prematura de performance;
- reescrever módulos já adequadamente separados;
- mudar Bridge, Portal, Worker ou regras fiscais.
