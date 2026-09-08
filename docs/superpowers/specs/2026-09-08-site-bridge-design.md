# NFe Agendamento 2.0 — Arquitetura Site + Bridge mínimo

Data: 2026-09-08
Status: design aprovado em conversa; aguardando revisão do documento antes do plano de implementação

## 1. Objetivo

Reconstruir o NFe Agendamento em um repositório limpo, preservando somente as funcionalidades já maduras do projeto anterior e removendo a arquitetura de Central, pareamento, liderança, pasta compartilhada, fila distribuída e lote.

A experiência deve ser simples: abrir o site, informar uma chave de acesso de NF-e e consultar. Cada PC usa seu próprio Bridge Windows local apenas para operações que o navegador não consegue executar sozinho.

## 2. Princípio arquitetural

Tudo que puder viver no site deve viver no site.

O Bridge deve ser deliberadamente pequeno e sem regras de apresentação ou negócio que possam ser executadas no navegador.

Fluxo normal:

`Site -> Bridge local -> certificado A1 / SEFAZ -> XML ou status bruto -> Site`

Fluxo de fallback:

`Site -> Bridge local -> WebView2 / Portal oficial -> captcha manual -> XML -> Site`

## 3. Escopo funcional

### Incluído

- consulta de uma NF-e por chave de acesso;
- uso do certificado A1 instalado/configurado no PC atual;
- tratamento de resposta fiscal e erros no site;
- parsing e validação estrutural do XML no site;
- visualização de DANFE no site;
- geração/impressão/salvamento de PDF pelo navegador;
- download do XML pelo site;
- tratamento especial de produtos Fernando Klein;
- fallback pelo Portal oficial quando a consulta normal atingir consumo indevido/limite, incluindo cStat 656 quando aplicável;
- WebView2 aberto pelo Bridge apenas quando o fallback for solicitado;
- usuário resolve captcha manualmente;
- Bridge captura o XML obtido pelo Portal e o devolve ao site;
- detecção de disponibilidade e versão do Bridge;
- seleção/configuração de certificado exposta no site por meio de endpoints locais do Bridge.

### Fora de escopo

- login;
- usuários;
- histórico de consultas;
- banco de dados;
- consulta em lote;
- Central;
- pareamento;
- liderança/standby;
- fila compartilhada;
- pasta de rede;
- coordenação entre PCs;
- certificado compartilhado;
- servidor LAN;
- DANFE ou regras Fernando Klein dentro do Bridge.

## 4. Componentes

### 4.1 Site

Hospedagem recomendada: Cloudflare Workers Static Assets.

Motivo: para projetos novos a própria Cloudflare recomenda Workers Static Assets no lugar de Pages, mantendo o site estático e sem backend quando não houver necessidade de lógica no servidor.

Stack proposta:

- Vite;
- TypeScript;
- HTML/CSS;
- sem framework de UI nesta primeira versão;
- testes unitários/regressão para parsing, Fernando Klein e DANFE;
- build estático para Cloudflare Workers Static Assets.

Responsabilidades:

- UI completa;
- validação da chave de 44 dígitos;
- detecção do Bridge;
- seleção do certificado usando API local;
- envio da chave ao Bridge;
- interpretação do retorno fiscal;
- parsing do XML;
- validações do XML recebido contra a chave consultada;
- tratamento Fernando Klein;
- renderização do DANFE;
- download do XML;
- impressão/PDF;
- decisão de acionar fallback Portal;
- mensagens e estados da interface;
- acompanhamento do fallback enquanto a janela WebView2 estiver aberta.

O site não recebe nem manipula a chave privada do certificado.

### 4.2 Bridge Windows

Stack proposta:

- .NET 10;
- Windows;
- ASP.NET Core minimal API em loopback;
- WebView2 somente para o fallback Portal;
- sem interface própria permanente;
- sem banco;
- sem servidor LAN.

Bind obrigatório:

`127.0.0.1`

O Bridge não deve aceitar conexões por IP da LAN.

Responsabilidades exclusivas:

1. informar saúde/versão;
2. listar certificados A1 válidos acessíveis no Windows;
3. persistir localmente somente a referência do certificado selecionado, nunca exportar a chave privada;
4. executar a requisição autenticada à SEFAZ usando o certificado local;
5. devolver XML ou status fiscal bruto ao site;
6. abrir WebView2 no Portal oficial quando solicitado;
7. acompanhar o download gerado pelo Portal;
8. validar requisitos mínimos do arquivo capturado antes de devolvê-lo;
9. apagar arquivos temporários do fallback depois da entrega.

O Bridge não deve:

- renderizar DANFE;
- conhecer catálogo Fernando Klein;
- manter histórico fiscal;
- coordenar outros computadores;
- processar lote;
- servir o site;
- possuir autenticação de usuário.

## 5. API local do Bridge

Contrato inicial proposto:

### `GET /health`

Retorna:

- versão do Bridge;
- estado operacional;
- presença do WebView2 Runtime;
- se existe certificado selecionado.

### `GET /certificates`

Retorna somente metadados mínimos dos certificados utilizáveis, por exemplo:

- subject/nome;
- emissor;
- validade;
- thumbprint/identificador técnico necessário.

Nunca retorna material de chave privada.

### `POST /certificate/select`

Seleciona localmente um certificado da lista permitida.

### `POST /nfe/lookup`

Entrada:

- chave de acesso validada pelo site.

Saída normalizada em envelope simples:

- sucesso com XML bruto;
- status fiscal sem XML;
- consumo indevido/limite;
- falha de certificado;
- indisponibilidade de transporte;
- erro técnico.

O Bridge não transforma o XML para DANFE.

### `POST /portal/start`

Inicia o fallback em WebView2 para uma chave específica.

Deve exigir ação explícita iniciada pelo site e não pode abrir arbitrariamente URLs fornecidas pelo cliente.

### `GET /portal/status/{operationId}`

Retorna:

- aguardando usuário/captcha;
- em processamento;
- concluído com XML;
- cancelado;
- falha.

O `operationId` é efêmero e local.

## 6. Segurança entre site e Bridge

Um site público falando com `127.0.0.1` exige proteção contra páginas maliciosas tentando acionar serviços locais.

Regras obrigatórias:

- bind somente em `127.0.0.1`;
- CORS em allowlist, nunca `*`;
- validar `Origin` em todas as operações sensíveis;
- produção aceita somente o domínio oficial do NFe Agendamento;
- ambiente de desenvolvimento aceita somente origens locais explicitamente configuradas;
- métodos mutáveis usam `application/json` e header customizado do protocolo para forçar preflight CORS;
- rejeitar requests sem `Origin` quando o endpoint for destinado ao site;
- rejeitar `Host` inesperado;
- limitar tamanho dos bodies;
- validar chave NF-e também no Bridge, mesmo já validada pelo site;
- nunca aceitar URL de Portal enviada pelo site; URLs oficiais ficam fixas no Bridge;
- nenhuma chave privada, senha de PFX ou segredo fiscal é devolvido ao navegador;
- arquivos temporários do Portal ficam fora de diretórios públicos e são removidos após uso;
- não registrar XML completo nem dados sensíveis em logs por padrão.

### Acesso à rede local do navegador

O site será HTTPS. Navegadores modernos tratam conexões de sites públicos para loopback como Local Network Access e podem solicitar ao usuário permissão de acesso local.

O produto deve:

- detectar falha de permissão/indisponibilidade do Bridge;
- explicar no próprio site como permitir o acesso;
- não tentar contornar a política do navegador;
- manter `127.0.0.1` como destino explícito;
- testar Chrome/Edge e Firefox no roteiro de compatibilidade;
- tratar outros navegadores como compatibilidade a validar antes de declarar suporte.

## 7. Consulta normal

1. Site verifica `/health`.
2. Usuário informa chave.
3. Site valida formato.
4. Site verifica certificado selecionado; se necessário, mostra seleção no próprio site.
5. Site chama `/nfe/lookup`.
6. Bridge valida novamente a chave.
7. Bridge usa certificado A1 local para consultar SEFAZ.
8. Bridge devolve XML/status bruto.
9. Site valida se o XML corresponde à chave solicitada.
10. Site faz parsing.
11. Site aplica Fernando Klein quando aplicável.
12. Site renderiza DANFE e libera XML/PDF.

## 8. Fallback Portal

Objetivo: aproximar a experiência do FSist sem esconder o captcha exigido pelo Portal.

1. Site identifica resposta que requer fallback, incluindo consumo indevido/limite conforme regras fiscais implementadas.
2. Site apresenta estado claro e inicia `/portal/start` após ação do usuário quando necessária pelas políticas de browser/desktop.
3. Bridge abre uma janela WebView2 dedicada no Portal oficial.
4. Chave é preenchida pelo Bridge quando tecnicamente estável e permitido pelo fluxo do Portal.
5. Usuário resolve captcha manualmente.
6. Bridge acompanha navegação/download sem tentar quebrar ou automatizar o captcha.
7. Quando o Portal disponibiliza o XML, o Bridge captura o arquivo em diretório temporário controlado.
8. Bridge valida tipo/tamanho e associação mínima com a operação.
9. Bridge disponibiliza o XML pelo status da operação.
10. Site recebe o XML e executa exatamente o mesmo pipeline de parsing, Fernando Klein e DANFE da consulta normal.
11. Bridge remove o arquivo temporário.

Se o Portal mudar, o fallback pode falhar sem afetar o fluxo normal da SEFAZ. O site deve apresentar erro específico de Portal, não erro genérico de consulta.

## 9. DANFE

O layout aprovado do projeto anterior será portado como comportamento de referência, não redesenhado do zero.

Requisitos preservados:

- aparência atual aprovada;
- fontes legíveis;
- bom aproveitamento da página A4;
- tabela de itens compacta sem sacrificar legibilidade;
- contador/ordem dos itens correto;
- evitar quebra de página desnecessária;
- omitir blocos sem utilidade quando a regra atual já fizer isso;
- popup/visualização focada no DANFE;
- `Ctrl + scroll` para zoom somente da visualização do DANFE;
- impressão e salvar como PDF via navegador;
- XML original nunca é alterado para produzir a apresentação.

O código do DANFE deve ficar isolado do código de transporte/Bridge.

## 10. Fernando Klein

O tratamento atual será portado do projeto anterior com seus testes de regressão.

Regras preservadas:

- identificar quando o mapeamento se aplica;
- catálogo e aliases existentes são a fonte inicial;
- alteração apenas de apresentação interna quando aplicável;
- preservar `cProd` e XML fiscal original;
- produtos desconhecidos não podem ser silenciosamente convertidos para outro item;
- cobertura de regressão com fixture real/sanitizada já existente no projeto anterior.

## 11. Estado e persistência

### Site

Sem login e sem histórico persistente.

Pode manter estado somente durante a sessão atual do navegador para melhorar UX.

### Bridge

Persistência mínima permitida:

- configuração do certificado selecionado;
- preferências técnicas estritamente locais se necessárias.

Não persistir:

- histórico de chaves;
- histórico de XML;
- banco de NF-e.

Fallback pode usar arquivos temporários, removidos após conclusão/cancelamento.

## 12. Tratamento de erros

O site deve distinguir pelo menos:

- Bridge não instalado;
- Bridge sem permissão de acesso local no navegador;
- Bridge indisponível;
- certificado não configurado;
- certificado vencido/inválido;
- chave inválida;
- NF-e não encontrada/sem XML disponível;
- consumo indevido/limite;
- SEFAZ indisponível;
- Portal indisponível;
- captcha/fallback cancelado;
- XML retornado inválido ou incompatível com a chave;
- erro interno do Bridge.

Nenhuma falha ambígua deve disparar retries agressivos automáticos contra a SEFAZ.

## 13. Estrutura proposta do repositório

```text
/
  apps/
    web/
      src/
      public/
      tests/
    bridge/
      src/
      tests/
  docs/
    architecture/
    testing/
    superpowers/
      specs/
      plans/
  .github/
    workflows/
  README.md
  package.json
```

O código aproveitado do projeto anterior deve ser portado conscientemente, arquivo por arquivo, acompanhado dos testes relevantes. Não copiar a árvore antiga inteira.

## 14. Estratégia de testes

### Site

- validação de chave;
- parsing XML;
- XML incompatível com chave;
- Fernando Klein;
- DANFE regressions;
- estados da UI;
- contrato do cliente Bridge;
- fallback e polling usando Bridge mockado.

### Bridge

- bind somente loopback;
- CORS/Origin/Host;
- validação de chave;
- seleção de certificado;
- contrato de lookup com transport mockado;
- ausência de retry inseguro;
- WebView2 adapter isolado;
- captura/validação/limpeza de arquivo temporário;
- URLs do Portal fixas;
- nenhum endpoint de LAN, lote, Central ou pareamento.

### CI

- build do site;
- testes do site;
- build .NET Release;
- testes .NET;
- lint/typecheck;
- verificações de segurança/regressão;
- artifact do Bridge Windows quando a pipeline de release for introduzida.

## 15. Migração do projeto anterior

Portar somente:

- visual/layout aprovado do site;
- DANFE atual e testes associados;
- `product-mapping`/Fernando Klein e testes;
- fixtures necessárias;
- parsing/validação XML que for comprovadamente reutilizável;
- partes úteis do transporte fiscal;
- partes úteis do fallback Portal/WebView2.

Não portar:

- Central;
- pareamento;
- fila compartilhada;
- shared lock;
- shared cooldown;
- leader election;
- group identity;
- servidor LAN;
- lote;
- autenticação/login;
- histórico/banco.

## 16. Critérios de aceite da arquitetura

A primeira versão é considerada arquiteturalmente correta quando:

1. um PC com Bridge instalado abre o site e o site detecta o Bridge;
2. o site consegue selecionar um certificado local sem receber sua chave privada;
3. uma chave válida pode ser consultada por meio do Bridge;
4. XML válido volta ao site e todo processamento visual ocorre no navegador;
5. Fernando Klein preserva exatamente o comportamento aprovado;
6. DANFE preserva o comportamento/layout aprovado;
7. não existe login, lote, Central, pareamento ou pasta compartilhada;
8. cStat/limite aciona o fluxo de fallback correto;
9. WebView2 permite captcha manual e devolve o XML ao site após obtenção;
10. Bridge não é acessível pela LAN;
11. origem web não autorizada não consegue acionar operações sensíveis do Bridge;
12. CI fica verde;
13. teste físico em Windows confirma site + Bridge + certificado + Portal.

## 17. Decisões fechadas

- repositório: `joaoldsxyzbr/Nfe-agendamento-2.0`;
- arquitetura: site online + Bridge local por PC;
- cada PC possui seu próprio Bridge e certificado A1;
- site sem login;
- sem histórico;
- sem lote;
- tudo que puder ficar no site ficará no site;
- Bridge faz somente capacidades impossíveis ou inadequadas ao navegador;
- DANFE e Fernando Klein serão preservados do projeto anterior;
- fallback Portal/WebView2 faz parte do produto;
- captcha permanece manual;
- nenhuma arquitetura Central será reaproveitada.
