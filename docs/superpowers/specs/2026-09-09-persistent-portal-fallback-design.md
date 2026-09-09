# Portal Persistente e Fallback Otimizado — Design

**Data:** 2026-09-09  
**Repositório:** `joaoldsxyzbr/Nfe-agendamento-2.0`  
**Status:** aguardando aprovação final da especificação

## Objetivo

Reduzir o tempo do fallback pelo Portal Nacional da NF-e sem alterar o fluxo fiscal principal: a consulta direta via Bridge/SEFAZ continua sendo sempre a primeira tentativa e o Portal só pode aparecer quando a consulta direta retornar `consumption_limit`.

## Escopo

Esta mudança cobre exclusivamente:

- gatilho do fallback Portal após limite de consumo;
- latência de abertura do Portal;
- reutilização do WebView2 entre operações;
- comunicação local entre Bridge e helper Portal;
- retorno mais rápido do XML concluído ao site;
- recuperação de falha do helper persistente;
- testes e documentação do fluxo.

Ficam fora de escopo:

- automação ou bypass do hCaptcha;
- alteração da lógica fiscal da consulta direta;
- troca do Portal Nacional por fontes não oficiais;
- mudança no parser XML, DANFE ou tratamento Fernando Klein;
- concorrência de múltiplas operações Portal simultâneas no mesmo PC.

## Regras invariantes

1. A consulta direta via SEFAZ é sempre tentada antes de qualquer Portal.
2. O Portal só pode ser iniciado quando o resultado da consulta direta tiver `category === 'consumption_limit'`.
3. Falhas de certificado, transporte, status fiscal ou erros genéricos não podem abrir o Portal automaticamente.
4. O hCaptcha permanece manual.
5. O certificado A1 permanece no Windows; a chave privada não é exportada pelo Bridge nem pelo site.
6. Todo XML recebido pelo Portal deve ser validado contra a chave solicitada antes de ser entregue ao site.
7. Apenas uma operação Portal pode ficar ativa por PC de cada vez.
8. Nenhum endpoint novo deve ser exposto fora de loopback/IPC local.
9. Não haverá retry fiscal automático após falha de operação Portal.

## Arquitetura proposta

### 1. Fluxo normal

```text
Site
  -> Bridge local
    -> consulta direta SEFAZ
      -> success: XML -> site
      -> consumption_limit: aciona fallback Portal
      -> demais categorias: retorna erro/status ao site sem abrir Portal
```

O site mantém a decisão de fallback baseada exclusivamente em `consumption_limit`.

### 2. Portal persistente

O atual `NfeAgendamento.Portal.exe`, que hoje nasce e morre a cada consulta, passa a funcionar como helper persistente por sessão do usuário Windows.

Responsabilidades do processo persistente:

- iniciar o ambiente WebView2 uma única vez;
- manter o perfil local já existente em `%LOCALAPPDATA%/NfeAgendamentoBridge/webview2`;
- permanecer sem janela visível quando ocioso;
- receber uma operação por vez do Bridge;
- navegar/preparar o Portal Nacional quando acionado;
- exibir a janela somente durante uma operação real;
- selecionar o certificado permitido quando o Portal solicitar client certificate;
- preencher automaticamente a chave de acesso após a página estar pronta;
- manter o hCaptcha estritamente manual;
- interceptar apenas o download oficial esperado de XML;
- devolver resultado terminal ao Bridge e voltar ao estado ocioso.

### 3. Comunicação Bridge <-> Portal

Recomendação: IPC local usando Named Pipes do Windows, com nome fixo por usuário/sessão e sem exposição TCP.

Motivos:

- evita abrir nova porta HTTP local;
- reduz superfície de ataque;
- funciona bem para processo pai/serviço local + helper GUI;
- oferece framing simples de mensagens e detecção clara de desconexão.

Mensagens mínimas:

```text
Bridge -> Portal
START_OPERATION
- operationId
- accessKey
- certificateThumbprint

Portal -> Bridge
READY
WAITING_FOR_USER
COMPLETED + xml
CANCELLED + message
FAILED + message
```

O protocolo deve usar JSON UTF-8 com tamanho máximo explícito por mensagem e comprimento prefixado para evitar leitura parcial/ambígua.

## Ciclo de vida

### Inicialização

1. Bridge verifica se o helper persistente está respondendo.
2. Se não estiver, inicia `NfeAgendamento.Portal.exe --server` de forma oculta.
3. O helper cria/inicializa o WebView2 em background.
4. O helper sinaliza `READY` após estar apto a receber operação.
5. O Bridge cacheia o estado de disponibilidade enquanto o processo permanecer saudável.

### Operação

1. Site recebe `consumption_limit` da consulta direta.
2. Site chama `/api/v1/portal/start`.
3. Bridge reserva a operação e envia `START_OPERATION` ao helper.
4. Helper torna a janela visível e navega/reutiliza o WebView2.
5. Chave é preenchida automaticamente assim que o DOM esperado estiver disponível.
6. Usuário resolve hCaptcha e solicita o XML.
7. Helper intercepta o download oficial.
8. XML é validado localmente e enviado ao Bridge.
9. Bridge faz a validação fiscal já existente novamente como defesa em profundidade.
10. Operação é marcada `completed` e a janela volta a ficar oculta.

### Encerramento

O helper persistente deve encerrar quando:

- o Bridge envia comando de shutdown;
- a sessão do Windows está encerrando;
- o processo Bridge deixa de existir por período de graça definido;
- ocorre falha fatal de inicialização do WebView2.

Não deve permanecer órfão indefinidamente.

## Otimizações de latência

### Ganhos imediatos e seguros

Antes do helper persistente, aplicar:

- cache do resultado positivo do probe de WebView2 durante a vida do Bridge;
- eliminar processos `--probe-runtime` repetidos por operação;
- reduzir polling web de 800 ms para intervalo menor somente enquanto uma operação Portal estiver ativa;
- manter backoff/limite para evitar polling agressivo desnecessário;
- evitar criação repetida de diretórios e verificações invariantes quando já resolvidas.

### Ganhos estruturais

Com helper persistente:

- evitar startup do processo Portal por consulta;
- evitar `CoreWebView2Environment.CreateAsync(...)` por consulta;
- evitar recriação do perfil WebView2;
- reaproveitar CoreWebView2 já inicializado;
- manter a página preparada quando tecnicamente seguro;
- substituir troca intermediária de arquivo `resultPath` pelo envio do XML diretamente via IPC;
- manter arquivo temporário apenas para o download WebView2, apagando-o após leitura/validação.

## Segurança

### IPC

- Named Pipe acessível apenas ao usuário atual.
- Nome de pipe não deve conter dados fiscais.
- O servidor rejeita mensagens acima do limite esperado.
- Operações exigem `operationId` conhecido pelo Bridge.
- Uma operação ativa por vez.
- Desconexões invalidam a operação corrente; não há replay automático.

### Navegação WebView2

Continuam obrigatórias as proteções existentes:

- somente HTTPS;
- host oficial `www.nfe.fazenda.gov.br`;
- bloqueio de navegação externa;
- bloqueio de popup externo;
- certificado cliente selecionado somente para o host oficial;
- download aceito somente do endpoint oficial esperado;
- DevTools e menus de contexto desabilitados conforme comportamento atual.

### XML

Validação obrigatória antes da entrega ao site:

- tamanho máximo atual preservado;
- DTD proibido;
- `XmlResolver = null`;
- raiz `nfeProc`;
- `infNFe/@Id == "NFe" + accessKey`;
- segunda validação no Bridge usando `NfePortalXmlValidator`.

## Concorrência

O Portal persistente opera como recurso exclusivo.

Estado lógico sugerido:

```text
Starting
Idle
Busy(operationId)
Recovering
Faulted
Stopping
```

Regras:

- `START_OPERATION` em `Idle` -> `Busy`;
- nova operação durante `Busy` é rejeitada de forma determinística;
- ao completar/cancelar/falhar -> `Idle`;
- queda do processo -> Bridge marca operação ativa como `failed` e entra em recuperação;
- helper reiniciado só prepara a próxima operação; a operação perdida não é repetida automaticamente.

## Recuperação de falhas

### Helper não está rodando

Bridge inicia o helper e aguarda readiness com timeout curto e explícito.

### Helper cai durante operação

- operação ativa vira `failed`;
- site recebe mensagem clara;
- Bridge limpa a referência de processo/conexão;
- próxima operação pode reinicializar o helper;
- sem retry automático da operação perdida.

### WebView2 não inicializa

- helper informa falha fatal;
- Portal é considerado indisponível;
- site recebe mensagem acionável;
- o Bridge não entra em loop de reinício rápido.

### Usuário fecha a janela

- estado `cancelled`;
- helper permanece vivo e volta para `Idle`;
- próxima consulta pode reutilizá-lo.

## Contratos existentes preservados

O contrato web público do Bridge permanece:

```text
POST /api/v1/portal/start
GET  /api/v1/portal/status/{operationId}
```

O site não precisa conhecer a existência de Named Pipes nem o ciclo de vida do helper persistente.

Isso preserva isolamento entre frontend e implementação Windows.

## Polling do site

O polling atual de 800 ms pode ser reduzido para melhorar percepção de resposta, mas deve permanecer simples e limitado.

Recomendação:

- 250 ms enquanto `waiting_for_user`/finalização imediata;
- sem chamadas paralelas;
- AbortSignal continua obrigatório;
- sem deadline global artificial enquanto o usuário resolve o hCaptcha;
- cada request mantém timeout próprio já previsto no BridgeClient.

A maior redução de latência virá do processo persistente, não do polling; portanto o polling não deve ser tornado excessivamente agressivo.

## Testes obrigatórios

### Web

- consulta `success` nunca chama Portal;
- `consumption_limit` chama Portal;
- `certificate_error` não chama Portal;
- `transport_unavailable` não chama Portal;
- `fiscal_status` não chama Portal;
- polling encerra imediatamente em estado terminal;
- AbortSignal interrompe polling;
- novo intervalo de polling permanece controlado.

### Bridge

- probe WebView2 positivo é cacheado e não cria novo processo por operação;
- helper é iniciado quando indisponível;
- readiness timeout retorna falha limpa;
- segunda operação reutiliza helper já saudável;
- operação concorrente é rejeitada/serializada conforme contrato definido;
- desconexão do helper falha a operação corrente sem retry;
- próxima operação consegue reiniciar helper;
- XML de chave divergente é recusado;
- XML acima do limite é recusado;
- cancelamento retorna `cancelled` e libera o helper.

### Portal helper

- modo `--server` inicializa sem janela visível;
- WebView2 é criado uma vez por processo;
- `START_OPERATION` exibe janela e prepara chave;
- finalizar operação oculta janela sem encerrar processo;
- fechar manualmente durante operação produz `cancelled`;
- navegação externa permanece bloqueada;
- download não oficial permanece bloqueado;
- certificado fora do host oficial permanece bloqueado.

## Medição de desempenho

Registrar telemetria apenas local em log técnico, sem persistir XML/chave completa:

- tempo de startup do helper;
- tempo até `READY`;
- tempo entre `START_OPERATION` e janela pronta;
- tempo entre download concluído e `completed` no Bridge.

Critério de sucesso técnico:

- segunda abertura na mesma sessão elimina startup de processo e inicialização completa do WebView2;
- retorno do XML após download não depende de polling de arquivo entre processos;
- nenhuma regressão nos testes de segurança/validação existentes.

Não definir meta absoluta em milissegundos sem medição real no PC Windows do usuário.

## Compatibilidade e migração

- manter suporte ao executável `NfeAgendamento.Portal.exe` no mesmo pacote;
- adicionar `--server` preservando `--probe-runtime` durante migração;
- remover o modo descartável antigo apenas depois que os testes do modo persistente estiverem verdes e o novo launcher estiver em uso;
- pacote/installer continuam distribuindo Bridge, App de bandeja e Portal helper juntos;
- nenhuma mudança de configuração manual para o usuário.

## Boas práticas adotadas

- TDD obrigatório para cada mudança comportamental;
- commits pequenos e reversíveis;
- interfaces pequenas entre Bridge e Portal;
- timeouts explícitos em startup/conexão, mas não no tempo humano do hCaptcha;
- cancelamento cooperativo com `CancellationToken`/`AbortSignal`;
- logs sem chave completa, XML ou segredo;
- defesa em profundidade na validação do XML;
- fail closed em IPC, navegação e certificado;
- YAGNI: sem fila multi-operação, sem serviço Windows, sem banco, sem WebSocket no frontend;
- manter o site desacoplado da implementação Windows.

## Critérios de aceite

A implementação será considerada pronta quando:

1. consulta direta continua sendo o caminho padrão;
2. Portal só aparece após `consumption_limit`;
3. primeira operação inicializa helper automaticamente;
4. segunda operação na mesma sessão reaproveita o helper/WebView2;
5. hCaptcha continua manual;
6. XML oficial correto chega ao site e renderiza pelo pipeline atual;
7. queda do helper não dispara retry fiscal automático;
8. operação seguinte se recupera após queda do helper;
9. uma segunda operação simultânea não mistura contexto;
10. todos os testes web, Bridge, Portal, build e pacote Windows passam;
11. README, acceptance docs e release notes refletem o novo comportamento;
12. teste físico em Windows confirma melhora perceptível entre primeira e segunda abertura.
