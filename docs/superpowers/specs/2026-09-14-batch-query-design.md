# Consulta em lote — desenho implementado

**Data:** 2026-09-14  
**Estado:** implementado na `main`; validação física pendente; ainda não publicado em release  
**Base:** arquitetura `site estático + App/Bridge local por PC`

## Objetivo

Adicionar consulta/download de várias NF-e sem transformar o lote em um gerador de bloqueio `656`, sem reintroduzir Central/pareamento e sem enfraquecer as garantias da consulta única.

A implementação privilegia segurança fiscal e previsibilidade: no máximo 10 NF-e por lote, processamento estritamente sequencial, zero retry fiscal automático e fallback controlado para o Portal Nacional.

## Arquitetura implementada

O lote é um **orquestrador no site sobre o endpoint unitário `POST /api/v1/nfe/lookup`**. Não existe endpoint fiscal `/nfe/batch` que dispare várias consultas em paralelo.

Fluxo:

```text
Usuário cola várias chaves
  -> validação local das 44 posições/DV
  -> remoção de duplicadas
  -> pré-checagem Bridge + A1
  -> todas as chaves válidas aparecem abaixo do campo
  -> processamento de uma chave por vez
       -> sucesso SEFAZ: valida XML e libera Visualizar DANFE / Baixar XML
       -> cStat 217: usa Portal apenas para aquela NF-e
       -> 656 / HTTP 429 / consumption_limit:
            -> Bridge registra proteção fiscal local
            -> não toca novamente na SEFAZ durante a proteção
            -> NF-e atual usa Portal
            -> itens restantes seguem pelo Portal, um por vez
       -> transporte/erro ambíguo: marca o item e não repete
  -> resultados concluídos continuam disponíveis individualmente
  -> XMLs concluídos podem ser baixados em ZIP
  -> DANFEs concluídos podem ser impressos em conjunto
```

## Limites e serialização

- máximo de **10 NF-e por lote**;
- uma única consulta/fallback ativa por vez no lote;
- sem paralelismo contra a SEFAZ;
- sem duas operações Portal simultâneas;
- nenhuma repetição automática de uma consulta fiscal ambígua;
- cancelar o lote aborta a operação corrente quando possível e não inicia a próxima;
- resultados já concluídos permanecem disponíveis após cancelamento.

O limite de 10 é conservador e não substitui as regras oficiais da SEFAZ. Como os PCs continuam independentes, o Bridge não conhece consumo feito por outro computador que use o mesmo CNPJ.

## Proteção fiscal no Bridge

Foi implementado `FiscalUsageGuard` em `apps/bridge/src/NfeAgendamento.Bridge/Fiscal/FiscalUsageGuard.cs`.

O guard possui:

1. **gate fiscal único** (`SemaphoreSlim`) para serializar chamadas `NFeDistribuicaoDFe` naquele PC, inclusive entre abas;
2. estado local por identidade fiscal;
3. janela de uma hora para tentativas diretas;
4. limite local conservador de 20 tentativas diretas por hora;
5. `blockedUntilUtc` após `656` ou HTTP 429;
6. persistência em `%LOCALAPPDATA%/NfeAgendamentoBridge/fiscal-usage.json`.

A persistência contém somente:

- SHA-256 do CNPJ usado como identificador;
- timestamps das tentativas diretas;
- prazo de proteção fiscal.

Ela **não contém** chave NF-e, XML, PFX, senha, chave privada ou o CNPJ em texto puro.

Durante uma proteção ativa, `NfeLookupService` devolve `consumption_limit` localmente **sem chamar o transporte SEFAZ**. No lote isso faz a interface mudar a rota para Portal. A consulta única continua usando o mesmo fallback já existente.

## Comportamento do Portal

O Portal mantém as mesmas garantias da consulta única:

- uma operação por vez;
- hCaptcha sempre manual;
- certificado A1 já selecionado no computador;
- XML validado contra a chave antes de ser aceito;
- sem fabricação de token, serviço de resolução ou tentativa de contornar captcha.

### `217`

Quando apenas uma NF-e retorna `217`, aquela linha segue pelo Portal. Depois de concluída, a próxima NF-e volta à SEFAZ se não existir proteção fiscal ativa.

### `656`, HTTP 429 ou `consumption_limit`

Ao atingir limite:

1. o Bridge registra a proteção antes de permitir nova consulta direta;
2. a NF-e atual passa para o Portal;
3. a rota geral do lote muda para Portal;
4. as chaves restantes são processadas pelo Portal, uma por vez;
5. cada hCaptcha continua manual;
6. nenhuma NF-e restante volta à SEFAZ naquele lote.

Uma consulta iniciada enquanto o Bridge já está em proteção faz uma chamada local ao endpoint unitário, recebe `consumption_limit` sem comunicação fiscal e passa imediatamente para a rota Portal.

## Interface implementada

A tela principal possui alternância discreta **Uma NF-e | Lote**.

No modo **Lote** existem:

- textarea para colar as chaves;
- extração de chaves formatadas ou separadas por linha/vírgula/ponto e vírgula;
- validação de DV antes de iniciar;
- contadores de válidas, inválidas e duplicadas;
- bloqueio quando houver mais de 10 chaves válidas;
- lista das chaves válidas preservando a ordem original;
- progresso geral;
- indicação da rota atual (`SEFAZ` ou `Portal`);
- **Cancelar lote**;
- **Baixar XMLs (.zip)**;
- **Imprimir DANFEs**.

### Linha de cada NF-e

Cada linha mostra:

- ordem;
- chave abreviada visualmente, mantendo a completa no contexto do elemento;
- status da operação;
- origem do XML (`SEFAZ` ou `Portal`) após sucesso;
- número, série, emitente e valor quando disponíveis no XML;
- **Visualizar DANFE**;
- **Baixar XML**.

**Visualizar DANFE** e **Baixar XML** são habilitados imediatamente quando o XML daquela linha foi validado, sem esperar o lote inteiro terminar.

O DANFE individual reutiliza o mesmo renderer/modal da consulta única, inclusive `Ctrl + scroll`, regras por fornecedor e impressão/PDF.

Se uma operação Portal falhar, a linha fica em `portal_error` e oferece **Tentar pelo Portal**. Não existe retry automático infinito.

## XML, ZIP e impressão

- XMLs ficam somente em memória na página;
- fechar/recarregar a página descarta o lote;
- download individual usa exatamente o XML validado daquela linha;
- ZIP é gerado no navegador sem dependência externa e contém somente XMLs concluídos;
- impressão conjunta agrega somente DANFEs concluídos e reutiliza o renderer fiscal existente;
- Bridge não persiste XMLs do lote.

## Estados por item

- `queued` — aguardando;
- `consulting` — consulta SEFAZ em andamento;
- `portal_queued` — aguardando Portal;
- `portal_waiting_user` — aguardando hCaptcha manual;
- `success` — XML obtido e validado;
- `fiscal_status` — retorno fiscal sem XML não elegível ao fallback;
- `transport_error` — falha/resultado ambíguo, sem retry;
- `portal_error` — Portal não concluiu;
- `cancelled` — cancelado.

## Testes automatizados adicionados

### Web

- `apps/web/tests/batch-input.test.ts`: entrada, formatação, deduplicação e limite;
- `apps/web/tests/batch-zip.test.ts`: geração do ZIP local;
- `apps/web/tests/shell.test.ts`: wiring da interface híbrida, ações individuais e ações em massa.

### Bridge

- `FiscalUsageGuardTests.cs`: limite local, hash do CNPJ, persistência e expiração;
- `NfeLookupUsageGuardTests.cs`: `656` bloqueia a próxima chamada antes do transporte;
- testes existentes de `NfeLookupService` continuam cobrindo `138`, `137`, `656`, 429, timeout/falhas e certificado.

## Validação física necessária

O CI consegue validar lógica, builds e empacotamento, mas não comprova a interação externa real com SEFAZ, WebView2, certificado A1 e hCaptcha.

Antes da próxima release, executar `docs/testing/batch-query.md`. Não provoque `656` artificialmente repetindo consultas apenas para testar o fallback.

## Evolução para volume alto

`distNSU` continua fora desta versão. Se o uso real exigir dezenas/centenas de NF-e, será necessário antes resolver a coordenação do `ultNSU` por CNPJ entre PCs.

Opções futuras continuam sendo:

- um único PC responsável pelo cursor `distNSU` de cada CNPJ; ou
- coordenador mínimo compartilhado somente para cursor/lease, sem certificado e sem XML.

## Critério de aceite

A funcionalidade pode ser declarada pronta para release quando:

- CI `web`, `bridge` e `windows-package` estiver verde no HEAD da `main`;
- lote pequeno real for validado com certificado A1;
- ações **Visualizar DANFE** e **Baixar XML** forem confirmadas por linha;
- ZIP e impressão conjunta forem confirmados;
- `217` for validado quando ocorrer naturalmente;
- proteção fiscal/fallback não fizer retry contra a SEFAZ;
- consulta única continuar funcionando sem regressão.
