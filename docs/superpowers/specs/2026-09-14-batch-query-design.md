# Consulta em lote — desenho proposto

**Data:** 2026-09-14  
**Estado:** planejamento; não implementado  
**Base:** arquitetura v0.0.12 (`site estático + App/Bridge local por PC`)

## Objetivo

Adicionar consulta/download de várias NF-e sem transformar o lote em um gerador de bloqueio `656`, sem reintroduzir Central/pareamento e sem enfraquecer as garantias já existentes de consulta única.

A primeira versão deve privilegiar segurança fiscal, previsibilidade e uma experiência simples: consultar várias chaves, acompanhar cada uma individualmente e manter as mesmas ações de visualizar DANFE e baixar XML já existentes na consulta única.

## Restrições que governam o desenho

- o Bridge atual consulta uma chave por vez via `consChNFe` no `NFeDistribuicaoDFe`;
- não existe retry fiscal automático e isso deve permanecer assim;
- `consumption_limit`, HTTP 429 e `cStat 656` não podem provocar nova tentativa automática contra a SEFAZ;
- o fallback Portal exige hCaptcha manual e o projeto admite somente uma operação Portal por PC;
- a arquitetura é independente por PC, sem coordenador central entre computadores;
- o mesmo CNPJ pode ser usado em mais de um PC, então um contador exclusivamente local não conhece o consumo feito pelos demais computadores;
- a regra oficial vigente para `consChNFe`/`consNSU` limita o uso a 20 consultas em uma hora; ao receber `656`, deve-se aguardar uma hora completa e uma nova tentativa antecipada reinicia a janela de bloqueio;
- `distNSU` é o mecanismo oficial indicado para distribuição em volume e pode devolver lotes de até 50 documentos, porém exige sequência de `ultNSU` compartilhada pelo mesmo CNPJ. Em uma arquitetura multi-PC independente, dois computadores usando `distNSU` para o mesmo CNPJ podem disputar essa sequência e provocar uso indevido.

Por isso, `distNSU` não será usado na primeira versão do lote.

## Decisão de arquitetura para v1

O lote será um **orquestrador no site sobre o endpoint unitário já existente**. Não haverá endpoint fiscal `/nfe/batch` que dispare várias consultas de uma vez.

O fluxo será híbrido: começa pela SEFAZ e, quando existir condição já elegível ao fallback, usa o Portal Nacional sem repetir a tentativa direta.

```text
Usuário cola várias chaves
  -> validação local das 44 posições/DV
  -> remoção de duplicadas
  -> pré-checagem Bridge + A1
  -> lista as chaves abaixo do campo de entrada
  -> processa uma chave por vez
       -> sucesso SEFAZ: guarda XML somente na sessão e libera Visualizar/Baixar
       -> 217: abre Portal para aquela NF-e, sem repetir SEFAZ
       -> 656/429/consumption_limit:
            -> grava cooldown fiscal local
            -> não toca novamente na SEFAZ durante o cooldown
            -> envia a NF-e atual para o Portal
            -> itens restantes passam a usar Portal sequencialmente
       -> transporte/erro ambíguo: marca o item e NÃO repete
  -> resumo final
  -> ações individuais continuam disponíveis por NF-e concluída
  -> opcionalmente ZIP dos XMLs / impressão conjunta dos DANFEs
```

## Limite conservador da v1

- máximo de **10 NF-e por lote**;
- processamento estritamente sequencial;
- nunca existem duas consultas SEFAZ ou duas operações Portal em paralelo;
- nenhuma consulta seguinte começa enquanto a anterior não terminou;
- o limite de 10 é sobre o lote recebido, independentemente de quantas terminem pela SEFAZ ou pelo Portal.

O limite de 10 não substitui a regra oficial de 20/h. Ele deixa margem para consultas unitárias e para eventual uso do mesmo CNPJ em outro PC, mas não consegue garantir quota global porque não existe coordenação entre computadores.

## Proteção no Bridge

Além da fila no site, o Bridge deve ganhar duas proteções globais para o PC:

1. **gate fiscal único** (`SemaphoreSlim(1,1)` ou equivalente) para serializar qualquer `NFeDistribuicaoDFe`, inclusive duas abas do navegador;
2. **FiscalUsageGuard** persistente e não sensível, mantendo apenas metadados necessários para segurança operacional:
   - hash do CNPJ/identidade fiscal do certificado;
   - timestamps das tentativas diretas recentes;
   - `blockedUntilUtc` quando houver `656`/HTTP 429.

Ao receber `656`/HTTP 429/`consumption_limit`, o Bridge deve gravar `blockedUntilUtc` e recusar localmente qualquer nova consulta direta desse CNPJ até o prazo terminar. Essa recusa local não toca a SEFAZ e, portanto, evita reiniciar acidentalmente a janela oficial de bloqueio.

O guard deve contar também consultas unitárias feitas fora do lote. Se uma consulta em lote começar durante cooldown já conhecido, ela deve iniciar diretamente pelo Portal, sem fazer uma tentativa de teste contra a SEFAZ.

A UI pode exibir um estado simples como `SEFAZ em proteção até HH:mm · lote seguindo pelo Portal`, sem expor histórico detalhado.

## Estados por item

- `queued` — aguardando processamento;
- `consulting` — consulta direta SEFAZ em andamento;
- `portal_queued` — aguardando sua vez no Portal porque a SEFAZ está em cooldown ou a NF-e exige fallback;
- `portal_waiting_user` — Portal aberto, aguardando hCaptcha manual;
- `success` — XML obtido e validado, seja pela SEFAZ ou pelo Portal;
- `fiscal_status` — retorno fiscal definitivo sem XML e não elegível ao Portal;
- `transport_error` — resultado ambíguo/indisponível; não repetir automaticamente;
- `portal_error` — Portal não concluiu aquela NF-e;
- `cancelled` — cancelado pelo usuário.

Cada item concluído deve guardar também a origem operacional do XML (`SEFAZ` ou `Portal`) somente para apresentação na sessão atual.

## Comportamento do Portal dentro do lote

O Portal continuará obedecendo exatamente às garantias da consulta única: uma operação por vez, hCaptcha manual, certificado selecionado pelo usuário e XML validado contra a chave antes de ser aceito.

### Retorno `217`

Quando apenas uma NF-e retornar `217`:

1. o lote pausa naquela linha;
2. o Portal abre automaticamente para a mesma chave;
3. o usuário resolve o hCaptcha;
4. o XML retorna e a linha passa para `success`;
5. a fila volta para a SEFAZ na próxima NF-e, desde que não exista cooldown ativo.

### Limite `656` / HTTP 429 / `consumption_limit`

Quando a SEFAZ atingir o limite:

1. registrar o cooldown local antes de qualquer nova tentativa;
2. a NF-e atual passa imediatamente para o Portal;
3. depois que ela concluir, os demais itens pendentes passam para `portal_queued`;
4. o Portal processa esses itens **um por vez**, abrindo automaticamente a próxima chave somente depois que a anterior finalizar;
5. cada hCaptcha continua sendo resolvido manualmente pelo usuário;
6. nenhuma das chaves restantes volta a tocar na SEFAZ enquanto o cooldown estiver ativo.

Isso não é retry fiscal: após o limite, o lote troca de rota e continua somente pelo fallback oficial já existente.

Se o usuário fechar/cancelar uma operação Portal, aquela linha fica em `portal_error`/`cancelled` e deve oferecer ação manual **Tentar pelo Portal**. O sistema não repete sozinho a mesma operação indefinidamente.

## Interface proposta

Na tela principal, adicionar alternância discreta **Uma NF-e | Lote**.

No modo **Lote**, a estrutura será:

1. textarea para colar as chaves;
2. resumo de entrada (`válidas`, `inválidas`, `duplicadas`);
3. botão **Iniciar lote**;
4. logo abaixo, uma lista/tabela com **todas as chaves válidas do lote**, preservando a ordem em que foram coladas;
5. progresso geral e estado da rota atual (`SEFAZ` ou `Portal`);
6. ações gerais de cancelar, baixar XMLs em ZIP e imprimir DANFEs concluídos.

### Linha de cada NF-e

Cada chave deve ocupar uma linha própria contendo:

- ordem do item (`1`, `2`, `3`...);
- chave de acesso, preferencialmente abreviada visualmente mas com acesso à chave completa;
- número/série, emitente e valor quando o XML já tiver sido carregado;
- status claro: `Aguardando`, `Consultando SEFAZ`, `Aguardando Portal`, `Resolva o hCaptcha`, `Concluída`, `Erro` etc.;
- indicação discreta da origem quando concluída: `SEFAZ` ou `Portal`;
- botão **Visualizar DANFE**;
- botão **Baixar XML**.

**Visualizar DANFE** e **Baixar XML** ficam desabilitados enquanto aquela NF-e não possuir XML validado. Assim que a linha chegar a `success`, os dois ficam disponíveis imediatamente, sem esperar o restante do lote terminar.

O botão **Visualizar DANFE** deve reutilizar exatamente o modal/renderer da consulta única, inclusive zoom `Ctrl + scroll`, impressão e regras específicas de fornecedores.

O botão **Baixar XML** deve baixar somente o XML daquela linha, com nome determinístico apropriado e sem modificar seu conteúdo.

Se a linha estiver em `portal_error`, ela pode substituir temporariamente essas ações por **Tentar pelo Portal**, voltando às ações normais depois de concluir.

### Ações gerais

Ao lado do progresso geral:

- **Cancelar lote** — para o processamento sem apagar o que já concluiu;
- **Baixar XMLs (.zip)** — contém somente NF-e concluídas;
- **Imprimir DANFEs** — agrega somente NF-e concluídas, cada DANFE iniciando em nova página.

Essas ações em massa são complementares. A ação principal continua existindo em cada linha, para que o usuário possa visualizar ou baixar qualquer NF-e individualmente assim que ela ficar pronta.

A chave completa só deve aparecer quando necessária na própria tela de trabalho; logs e mensagens de diagnóstico continuam sem persistir chaves.

## Dados e privacidade

- não persistir XMLs no Bridge;
- não persistir chaves do lote em logs;
- manter XMLs e resultados do lote somente em memória/sessão da página;
- ao recarregar/fechar a página, o lote é descartado;
- ZIP deve ser gerado no navegador;
- downloads individuais usam o mesmo XML validado mantido em memória;
- a impressão conjunta deve reutilizar o renderer DANFE existente, com `page-break` entre documentos.

## Cancelamento

Cancelar deve:

- abortar a requisição HTTP em andamento via `AbortController` quando possível;
- não iniciar o próximo item;
- cancelar operação Portal ativa quando houver;
- manter na tela todos os itens já concluídos, com **Visualizar DANFE** e **Baixar XML** funcionando;
- marcar itens ainda não iniciados como `cancelled`;
- nunca transformar cancelamento em retry.

## Testes obrigatórios

### Web

- validação e deduplicação de entrada;
- máximo de 10 NF-e por lote;
- lista renderiza todas as chaves válidas na ordem original;
- apenas uma operação de consulta/fallback ativa por vez;
- `success` libera **Visualizar DANFE** e **Baixar XML** imediatamente naquela linha;
- downloads individuais retornam o XML correto de cada linha;
- visualização individual usa o DANFE correto de cada NF-e;
- cancelamento impede próximo item e preserva ações dos já concluídos;
- `217` usa Portal apenas para aquela NF-e e depois permite retorno à SEFAZ;
- `656`/429/`consumption_limit` muda os itens restantes para Portal sem nova chamada SEFAZ;
- durante cooldown conhecido um novo lote começa diretamente pelo Portal;
- erro de transporte não é repetido;
- falha/cancelamento do Portal não entra em retry automático infinito;
- ZIP contém somente XMLs concluídos;
- impressão agrega somente DANFEs concluídos.

### Bridge

- gate impede duas consultas fiscais concorrentes;
- guard conta consulta unitária e lote na mesma janela;
- `656`/429 grava cooldown;
- durante cooldown nenhuma chamada chega ao transporte SEFAZ;
- reiniciar Bridge preserva cooldown;
- metadados persistidos não contêm chave NF-e, XML, PFX, senha ou chave privada;
- troca de certificado/CNPJ separa corretamente o estado do guard.

## Evolução para volume alto

Se o uso real exigir dezenas/centenas de NF-e por hora, não aumentar simplesmente o tamanho do lote de `consChNFe`.

A próxima arquitetura a estudar será `distNSU`, pois é o caminho oficial para distribuição em volume e pode retornar até 50 documentos por lote. Porém, antes disso será necessário resolver de forma explícita a coordenação do `ultNSU` por CNPJ entre PCs. Opções futuras:

- eleger um único PC responsável por `distNSU` para cada CNPJ; ou
- criar um coordenador compartilhado mínimo apenas para cursor/lease, sem certificado e sem XML.

Nenhuma dessas opções faz parte da v1.

## Critério de aceite da v1

A consulta em lote pode ser considerada pronta quando:

- mantém o endpoint unitário atual como primitive fiscal;
- processa no máximo 10 NF-e sequencialmente;
- não executa retries automáticos contra a SEFAZ;
- usa o Portal automaticamente para `217` e para o lote restante após `656`/429/`consumption_limit`;
- Bridge impede nova tentativa SEFAZ durante o cooldown registrado;
- todas as chaves do lote ficam visíveis em linhas individuais;
- cada NF-e concluída libera imediatamente **Visualizar DANFE** e **Baixar XML**;
- XMLs/DANFEs concluídos também podem ser baixados/impressos em conjunto;
- CI (`web`, `bridge`, `windows-package`) permanece verde;
- validação física confirma um lote pequeno real sem regressão na consulta unitária.
