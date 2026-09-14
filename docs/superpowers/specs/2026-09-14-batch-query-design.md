# Consulta em lote — desenho proposto

**Data:** 2026-09-14  
**Estado:** planejamento; não implementado  
**Base:** arquitetura v0.0.12 (`site estático + App/Bridge local por PC`)

## Objetivo

Adicionar consulta/download de várias NF-e sem transformar o lote em um gerador de bloqueio `656`, sem reintroduzir Central/pareamento e sem enfraquecer as garantias já existentes de consulta única.

A primeira versão deve privilegiar segurança fiscal e previsibilidade, não throughput máximo.

## Restrições que governam o desenho

- o Bridge atual consulta uma chave por vez via `consChNFe` no `NFeDistribuicaoDFe`;
- não existe retry fiscal automático e isso deve permanecer assim;
- `consumption_limit`, HTTP 429 e `cStat 656` não podem provocar nova tentativa automática;
- o fallback Portal exige hCaptcha manual e o projeto admite somente uma operação Portal por PC;
- a arquitetura é independente por PC, sem coordenador central entre computadores;
- o mesmo CNPJ pode ser usado em mais de um PC, então um contador exclusivamente local não conhece o consumo feito pelos demais computadores;
- a regra oficial vigente para `consChNFe`/`consNSU` limita o uso a 20 consultas em uma hora; ao receber `656`, deve-se aguardar uma hora completa e uma nova tentativa antecipada reinicia a janela de bloqueio;
- `distNSU` é o mecanismo oficial indicado para distribuição em volume e pode devolver lotes de até 50 documentos, porém exige sequência de `ultNSU` compartilhada pelo mesmo CNPJ. Em uma arquitetura multi-PC independente, dois computadores usando `distNSU` para o mesmo CNPJ podem disputar essa sequência e provocar uso indevido.

Por isso, `distNSU` não será usado na primeira versão do lote.

## Decisão de arquitetura para v1

O lote será um **orquestrador no site sobre o endpoint unitário já existente**. Não haverá endpoint fiscal `/nfe/batch` que dispare várias consultas de uma vez.

Fluxo:

```text
Usuário cola várias chaves
  -> validação local das 44 posições/DV
  -> remoção de duplicadas
  -> pré-checagem Bridge + A1
  -> fila local no navegador
  -> uma única consulta por vez
       -> sucesso: guarda XML somente na sessão do navegador
       -> 217: pausa o lote e oferece Portal para aquela NF-e
       -> 656/429/consumption_limit: bloqueia o lote imediatamente
       -> transporte/erro ambíguo: marca o item e NÃO repete
  -> resumo final
  -> ZIP dos XMLs concluídos / impressão conjunta dos DANFEs
```

## Limite conservador da v1

- máximo de **10 tentativas diretas por lote**;
- processamento estritamente sequencial;
- nenhuma consulta seguinte começa enquanto a anterior não terminou;
- não existe temporizador que retome o lote sozinho depois de bloqueio;
- o lote pode aceitar mais chaves como entrada no futuro, mas a v1 deve limitar o conjunto processável a 10 para manter comportamento simples e previsível.

O limite de 10 não substitui a regra oficial de 20/h. Ele deixa margem para consultas unitárias e para eventual uso do mesmo CNPJ em outro PC, mas não consegue garantir quota global porque não existe coordenação entre computadores.

## Proteção no Bridge

Além da fila no site, o Bridge deve ganhar duas proteções globais para o PC:

1. **gate fiscal único** (`SemaphoreSlim(1,1)` ou equivalente) para serializar qualquer `NFeDistribuicaoDFe`, inclusive duas abas do navegador;
2. **FiscalUsageGuard** persistente e não sensível, mantendo apenas metadados necessários para segurança operacional:
   - hash do CNPJ/identidade fiscal do certificado;
   - timestamps das tentativas diretas recentes;
   - `blockedUntilUtc` quando houver `656`/HTTP 429.

Ao receber `656`, o Bridge deve gravar `blockedUntilUtc = agora + 1h` e recusar localmente qualquer nova consulta direta desse CNPJ até o prazo terminar. Essa recusa local não toca a SEFAZ e, portanto, evita reiniciar acidentalmente a janela oficial de bloqueio.

O guard deve contar também consultas unitárias feitas fora do lote. A UI pode exibir apenas um estado simples como `Proteção fiscal ativa até HH:mm`, sem expor histórico detalhado.

## Estados por item

- `queued` — aguardando;
- `consulting` — consulta direta em andamento;
- `success` — XML obtido e validado;
- `needs_portal` — retorno elegível ao Portal (`217` ou condição equivalente já suportada);
- `portal_waiting_user` — aguardando hCaptcha manual;
- `fiscal_status` — retorno fiscal sem XML;
- `transport_error` — resultado ambíguo/indisponível; não repetir automaticamente;
- `blocked` — não processado porque a proteção fiscal interrompeu o lote;
- `cancelled` — cancelado pelo usuário.

## Comportamento do Portal dentro do lote

O Portal não será automatizado em massa.

Quando um item exigir Portal:

1. pausar a fila;
2. mostrar `Continuar pelo Portal` para aquele item;
3. abrir uma única operação Portal;
4. usuário resolve o hCaptcha manualmente;
5. ao obter XML, concluir aquele item;
6. o usuário decide explicitamente se continua o lote.

Se o gatilho foi `656`/consumption limit, **não continuar consultas diretas** depois do Portal. Os itens restantes ficam não processados.

## Interface proposta

Na tela principal, adicionar alternância discreta **Uma NF-e | Lote**.

No modo Lote:

- textarea para colar uma chave por linha (aceitar também texto com separadores e extrair somente sequências candidatas de 44 dígitos);
- contador `válidas / inválidas / duplicadas` antes de iniciar;
- botão **Iniciar lote**;
- tabela de progresso com número, chave abreviada, status, emitente/NF-e quando disponível e ação individual;
- progresso `3 de 10`;
- botão **Cancelar lote**;
- ao final, **Baixar XMLs (.zip)** e **Imprimir DANFEs** para os itens concluídos.

A chave completa só deve aparecer quando necessária na própria tela de trabalho; logs e mensagens de diagnóstico continuam sem persistir chaves.

## Dados e privacidade

- não persistir XMLs no Bridge;
- não persistir chaves do lote em logs;
- manter XMLs e resultados do lote somente em memória/sessão da página;
- ao recarregar/fechar a página, o lote é descartado;
- ZIP deve ser gerado no navegador;
- a impressão conjunta deve reutilizar o renderer DANFE existente, com `page-break` entre documentos.

## Cancelamento

Cancelar deve:

- abortar a requisição HTTP em andamento via `AbortController`;
- não iniciar o próximo item;
- cancelar operação Portal ativa quando houver;
- manter na tela os itens já concluídos para download/impressão;
- nunca transformar cancelamento em retry.

## Testes obrigatórios

### Web

- validação e deduplicação de entrada;
- máximo de 10 tentativas;
- apenas uma chamada `lookupNfe` ativa;
- cancelamento impede próximo item;
- `success` avança a fila;
- `217` pausa e exige Portal;
- `656`/`consumption_limit` bloqueia os restantes;
- erro de transporte não é repetido;
- ZIP contém somente XMLs concluídos;
- impressão agrega somente DANFEs concluídos.

### Bridge

- gate impede duas consultas fiscais concorrentes;
- guard conta consulta unitária e lote na mesma janela;
- `656` grava cooldown de uma hora;
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
- processa no máximo 10 tentativas diretas sequenciais;
- não executa retries automáticos;
- pausa corretamente para Portal;
- interrompe imediatamente em `656`/429/consumption limit;
- Bridge impede nova tentativa durante o cooldown registrado;
- XMLs/DANFEs concluídos podem ser baixados/impressos em conjunto;
- CI (`web`, `bridge`, `windows-package`) permanece verde;
- validação física confirma um lote pequeno real sem regressão na consulta unitária.
