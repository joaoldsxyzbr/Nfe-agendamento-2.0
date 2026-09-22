# Consulta em lote — desenho implementado

**Data:** 2026-09-14  
**Estado:** implementado e incluído na release v0.0.13; a `main` posterior remove o teto rígido de 10 chaves e unifica a interface de uma/várias NF-e; validação física real pendente  
**Base:** arquitetura `site estático + App/Bridge local por PC`

## Objetivo

Adicionar consulta/download de várias NF-e sem transformar o lote em um gerador de bloqueio `656`, sem reintroduzir Central/pareamento e sem enfraquecer as garantias da consulta única.

A implementação privilegia segurança fiscal e previsibilidade: sem limite rígido de quantidade na interface, processamento estritamente sequencial, zero retry fiscal automático e fallback controlado para o Portal Nacional.

## Arquitetura implementada

O processamento de várias chaves é um **orquestrador no site sobre o endpoint unitário `POST /api/v1/nfe/lookup`**. Não existe endpoint fiscal `/nfe/batch` que dispare várias consultas em paralelo.

Na interface atual da `main`, esse mesmo orquestrador é o fluxo visível único: uma chave forma uma fila com um item; várias chaves formam a fila sequencial completa.

Fluxo:

```text
Usuário cola uma ou várias chaves
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

## Quantidade e serialização

- não existe teto rígido de quantidade de NF-e na interface;
- uma única consulta/fallback fica ativa por vez;
- sem paralelismo contra a SEFAZ;
- sem duas operações Portal simultâneas;
- nenhuma repetição automática de uma consulta fiscal ambígua;
- cancelar o processamento aborta a operação corrente quando possível e não inicia a próxima;
- resultados já concluídos permanecem disponíveis após cancelamento.

A remoção do teto de 10 não altera as regras de proteção fiscal. Conjuntos grandes apenas mantêm a fila sequencial por mais tempo. Em produção, a rota direta continua protegida pelo guard local e pela coordenação multi-PC entre computadores que usam cópias do mesmo A1 RSA, conforme `docs/architecture/fiscal-usage-guard.md`.

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

Durante uma proteção ativa, `NfeLookupService` devolve `consumption_limit` localmente **sem chamar o transporte SEFAZ**. Na fila isso faz a interface mudar a rota para Portal.

O limite local de 20 tentativas diretas por hora protege somente a rota SEFAZ e não limita a quantidade total de itens. Depois que a proteção entra em ação, os itens restantes continuam pelo Portal.

## Comportamento do Portal

O Portal mantém as mesmas garantias:

- uma operação por vez;
- hCaptcha sempre manual;
- certificado A1 já selecionado no computador;
- XML validado contra a chave antes de ser aceito;
- sem fabricação de token, serviço de resolução ou tentativa de contornar captcha.

A aplicação não trata o Portal como serviço oficialmente ilimitado. A ausência de teto rígido significa apenas que a UI não bloqueia a quantidade de chaves; o fluxo continua sujeito ao hCaptcha, disponibilidade e comportamento do Portal Nacional.

### `217`

Quando apenas uma NF-e retorna `217`, aquela linha segue pelo Portal. Depois de concluída, a próxima NF-e volta à SEFAZ se não existir proteção fiscal ativa.

### `656`, HTTP 429 ou `consumption_limit`

Ao atingir limite:

1. o Bridge registra a proteção antes de permitir nova consulta direta;
2. a NF-e atual passa para o Portal;
3. a rota geral muda para Portal;
4. as chaves restantes são processadas pelo Portal, uma por vez;
5. cada hCaptcha continua manual;
6. nenhuma NF-e restante volta à SEFAZ naquela execução.

Uma consulta iniciada enquanto o Bridge já está em proteção faz uma chamada local ao endpoint unitário, recebe `consumption_limit` sem comunicação fiscal e passa imediatamente para a rota Portal.

## Interface implementada

A tela principal possui **uma interface de consulta**, sem alternância visível **Uma NF-e | Lote**.

Existem:

- textarea para colar uma ou várias chaves;
- extração de chaves formatadas ou separadas por linha/vírgula/ponto e vírgula;
- validação de DV antes de iniciar;
- contadores de válidas, inválidas e duplicadas;
- ausência de bloqueio artificial por quantidade de chaves válidas;
- lista das chaves válidas preservando a ordem original;
- botão **Consultar** alinhado à esquerda;
- botão **Nova consulta** ao lado de **Consultar**;
- progresso geral;
- indicação da rota atual (`SEFAZ` ou `Portal`);
- **Cancelar lote** durante processamento de várias chaves;
- **Baixar XMLs (.zip)**;
- **Imprimir DANFEs**.

Uma única chave usa o mesmo fluxo com apenas uma linha. **Nova consulta** limpa entrada e resultados e devolve o foco ao campo, ficando indisponível enquanto a fila está ativa.

### Linha de cada NF-e

Cada linha mostra:

- ordem;
- chave abreviada visualmente, mantendo a completa no contexto do elemento;
- status da operação;
- origem do XML (`SEFAZ` ou `Portal`) após sucesso;
- número, série, emitente e valor quando disponíveis no XML;
- **Visualizar DANFE**;
- **Baixar XML**.

**Visualizar DANFE** e **Baixar XML** são habilitados imediatamente quando o XML daquela linha foi validado, sem esperar as demais.

O DANFE individual reutiliza o mesmo renderer/modal, inclusive `Ctrl + scroll`, regras por fornecedor e impressão/PDF.

Se uma operação Portal falhar, a linha fica em `portal_error` e oferece **Tentar pelo Portal**. Não existe retry automático infinito.

## XML, ZIP e impressão

- XMLs ficam somente em memória na página;
- fechar/recarregar a página descarta os resultados;
- download individual usa exatamente o XML validado daquela linha;
- ZIP é gerado no navegador sem dependência externa e contém somente XMLs concluídos;
- impressão conjunta agrega somente DANFEs concluídos e reutiliza o renderer fiscal existente;
- Bridge não persiste XMLs da consulta.

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

## Testes automatizados

### Web

- `apps/web/tests/batch-input.test.ts`: entrada, formatação, deduplicação e aceitação de mais de 10 chaves sem teto rígido;
- `apps/web/tests/batch-zip.test.ts`: geração do ZIP local;
- `apps/web/tests/shell.test.ts`: wiring da interface unificada, ações individuais e ações em massa.

### Bridge

- `FiscalUsageGuardTests.cs`: limite local, hash do CNPJ, persistência e expiração;
- `NfeLookupUsageGuardTests.cs`: `656` bloqueia a próxima chamada antes do transporte;
- testes existentes de `NfeLookupService` continuam cobrindo `138`, `137`, `656`, 429, timeout/falhas e certificado.

## Validação física necessária

O CI consegue validar lógica, builds e empacotamento, mas não comprova a interação externa real com SEFAZ, WebView2, certificado A1 e hCaptcha.

Para declarar o comportamento atual fisicamente validado, executar `docs/testing/batch-query.md` em conjunto com `docs/testing/acceptance.md`. Não provoque `656` artificialmente repetindo consultas apenas para testar o fallback.

## Evolução para volume alto

`distNSU` continua fora desta versão. A consulta não possui teto rígido, mas `distNSU` pode continuar sendo estudado futuramente caso o uso real de dezenas/centenas de NF-e mostre necessidade de uma estratégia mais eficiente de distribuição.

Antes de usar `distNSU`, ainda será necessário resolver a coordenação do `ultNSU` por CNPJ entre PCs. Opções futuras continuam sendo:

- um único PC responsável pelo cursor `distNSU` de cada CNPJ; ou
- coordenador mínimo compartilhado somente para cursor/lease, sem certificado e sem XML.

## Critério de validação física

A funcionalidade pode ser declarada fisicamente validada quando:

- CI `web`, `bridge` e `windows-package` estiver verde no HEAD correspondente;
- consulta real com uma chave for validada com certificado A1;
- consulta pequena com várias chaves for validada;
- um conjunto com mais de 10 chaves for aceito sem bloqueio artificial e continuar sequencial;
- **Consultar** e **Nova consulta** forem confirmados no fluxo unificado;
- ações **Visualizar DANFE** e **Baixar XML** forem confirmadas por linha;
- ZIP e impressão conjunta forem confirmados;
- `217` for validado quando ocorrer naturalmente;
- proteção fiscal/fallback não fizer retry contra a SEFAZ.
