# NFe Agendamento 2.0 — Site + Bridge mínimo

Data: 2026-09-08
Status: revisado; aguardando aprovação final do documento antes do plano de implementação

## 1. Objetivo

Reconstruir o NFe Agendamento em um repositório limpo, preservando as partes maduras do produto anterior e eliminando a arquitetura de Central, pareamento, liderança, pasta compartilhada, fila distribuída e lote.

A experiência deve ser direta: abrir o site, informar uma chave de NF-e e consultar. Cada PC possui seu próprio Bridge Windows, usado apenas para capacidades que o navegador não consegue executar adequadamente.

Princípio central:

> Tudo que puder ficar no site fica no site.

Fluxo normal:

`Site -> Bridge local -> certificado A1 / SEFAZ -> XML ou status bruto -> Site`

Fluxo de fallback:

`Site -> Bridge local -> WebView2 / Portal oficial -> captcha manual -> XML -> Site`

## 2. Decisões fechadas

- repositório: `joaoldsxyzbr/Nfe-agendamento-2.0`;
- site online, sem login;
- sem histórico persistente;
- sem banco de dados;
- sem consulta em lote;
- um Bridge por PC;
- um certificado A1 local por PC;
- nenhuma Central;
- nenhum pareamento;
- nenhuma liderança/standby;
- nenhuma pasta compartilhada;
- nenhum servidor LAN;
- DANFE no site;
- Fernando Klein no site;
- fallback Portal/WebView2 faz parte do produto;
- captcha permanece manual;
- Bridge não recebe responsabilidades que possam ficar no navegador.

## 3. Site

### Stack

- Vite;
- TypeScript;
- HTML/CSS;
- sem framework de UI na primeira versão;
- build estático;
- Cloudflare Workers Static Assets para hospedagem.

Para um projeto novo, Workers Static Assets é preferido a Pages porque a Cloudflare direciona novos projetos estáticos para Workers.

### Responsabilidades

O site contém:

- UI completa;
- validação da chave de 44 dígitos;
- detecção do Bridge;
- seleção do certificado por meio da API local;
- envio da chave ao Bridge;
- interpretação do status fiscal;
- parsing e validação estrutural do XML;
- confirmação de que o XML corresponde à chave consultada;
- tratamento Fernando Klein;
- renderização do DANFE;
- download do XML;
- impressão/salvamento de PDF pelo navegador;
- mensagens e tratamento de erros;
- decisão de iniciar fallback Portal;
- acompanhamento do fallback até receber o XML.

O site nunca recebe ou manipula a chave privada do certificado.

## 4. Bridge Windows

### Stack

- .NET 10;
- Windows;
- ASP.NET Core Minimal API;
- WebView2 somente para fallback Portal;
- sem interface própria permanente;
- sem banco;
- sem servidor LAN.

### Endereço local fixo

Base local:

`http://127.0.0.1:17345`

API versionada:

`http://127.0.0.1:17345/api/v1`

O processo deve fazer bind somente em loopback. Não pode escutar `0.0.0.0`, IP da LAN ou hostname de rede.

### Responsabilidades exclusivas

1. informar saúde e versão;
2. listar certificados A1 utilizáveis no Windows;
3. persistir somente a referência do certificado selecionado;
4. executar chamada autenticada à SEFAZ com o certificado local;
5. devolver XML ou status fiscal bruto;
6. abrir WebView2 no Portal oficial quando solicitado;
7. acompanhar o fluxo/download do Portal sem automatizar captcha;
8. devolver o XML obtido pelo Portal ao site;
9. remover arquivos temporários usados no fallback.

### O Bridge não deve

- renderizar DANFE;
- conhecer catálogo Fernando Klein;
- manter histórico de chaves ou XML;
- possuir banco de NF-e;
- coordenar outros PCs;
- processar lote;
- servir o site;
- possuir login de usuário;
- receber URLs arbitrárias para abrir no WebView2.

## 5. Contrato inicial da API local

### `GET /api/v1/health`

Retorna:

- versão do Bridge;
- estado operacional;
- presença do WebView2 Runtime;
- se existe certificado selecionado.

### `GET /api/v1/certificates`

Retorna somente metadados mínimos de certificados utilizáveis:

- nome/subject;
- emissor;
- validade;
- identificador técnico necessário para seleção.

Nunca retorna material de chave privada.

### `POST /api/v1/certificate/select`

Seleciona um certificado local dentre os certificados permitidos.

### `POST /api/v1/nfe/lookup`

Entrada:

- chave de acesso.

Saída normalizada:

- sucesso com XML bruto;
- status fiscal sem XML;
- consumo indevido/limite;
- falha de certificado;
- indisponibilidade de transporte;
- erro técnico.

O Bridge não transforma XML em DANFE.

### `POST /api/v1/portal/start`

Inicia fallback para uma chave específica e retorna `operationId` efêmero.

A URL do Portal é fixa no Bridge. O cliente nunca fornece URL de navegação.

### `GET /api/v1/portal/status/{operationId}`

Retorna:

- aguardando usuário/captcha;
- processando;
- concluído com XML;
- cancelado;
- falha.

A operação e seus arquivos temporários são locais e efêmeros.

## 6. Segurança Site <-> Bridge

Um site público acessando loopback exige defesa contra páginas maliciosas tentando acionar serviços locais.

Regras obrigatórias:

- bind somente em `127.0.0.1`;
- CORS por allowlist, nunca `*`;
- validar `Origin` também no servidor;
- produção aceita somente a origem oficial do NFe Agendamento;
- desenvolvimento aceita apenas origens locais explicitamente configuradas;
- endpoints mutáveis exigem `application/json` e header próprio do protocolo, garantindo preflight;
- rejeitar `Origin` não permitido antes de executar operação sensível;
- rejeitar `Host` inesperado;
- limitar tamanho de request e resposta;
- validar a chave NF-e também no Bridge;
- URLs do Portal ficam compiladas/configuradas no Bridge, nunca vindas da página;
- nenhuma chave privada, senha de PFX ou segredo fiscal é retornado ao navegador;
- arquivos temporários ficam fora de diretórios públicos;
- não registrar XML completo nem dados fiscais sensíveis em logs por padrão.

### Local Network Access

O site será HTTPS e acessará `127.0.0.1`. Navegadores atuais podem exigir uma permissão de Local Network Access/loopback.

O site deve:

- detectar Bridge indisponível ou acesso local bloqueado;
- apresentar instrução simples para conceder a permissão;
- não tentar contornar a política do navegador;
- usar `127.0.0.1` explicitamente;
- validar suporte em Chrome/Edge e Firefox antes da primeira release;
- não declarar outros navegadores como suportados sem teste físico.

## 7. Consulta normal

1. Site consulta `/api/v1/health`.
2. Usuário informa a chave.
3. Site valida formato.
4. Site verifica se há certificado selecionado; se necessário, exibe seleção no próprio site.
5. Site chama `/api/v1/nfe/lookup`.
6. Bridge valida novamente a chave.
7. Bridge usa o certificado A1 local e chama a SEFAZ.
8. Bridge devolve XML/status bruto.
9. Site valida associação do XML com a chave.
10. Site faz parsing.
11. Site aplica Fernando Klein quando aplicável.
12. Site renderiza DANFE e libera XML/PDF.

Falhas ambíguas não devem provocar retries agressivos automáticos contra a SEFAZ.

## 8. Fallback Portal

Objetivo: experiência próxima ao FSist sem automatizar ou burlar captcha.

1. Site identifica que a consulta normal deve oferecer fallback, incluindo consumo indevido/limite conforme a regra fiscal implementada.
2. Site inicia `/api/v1/portal/start` quando o usuário prosseguir.
3. Bridge abre WebView2 no Portal oficial.
4. A chave pode ser preenchida pelo Bridge quando o fluxo do Portal permitir de forma estável.
5. Usuário resolve captcha manualmente.
6. Bridge acompanha navegação/download sem resolver captcha.
7. XML obtido é capturado em diretório temporário controlado.
8. Bridge valida tipo, tamanho e associação mínima com a operação.
9. Site acompanha `/api/v1/portal/status/{operationId}`.
10. Ao concluir, o mesmo pipeline de parsing, Fernando Klein e DANFE do fluxo normal processa o XML.
11. Bridge remove o arquivo temporário.

Mudanças no Portal podem quebrar somente o fallback. O fluxo normal da SEFAZ deve permanecer isolado.

## 9. DANFE a preservar

O DANFE atual do projeto anterior será portado como referência, sem redesenho inicial.

Preservar:

- layout aprovado;
- fontes legíveis;
- bom uso da folha A4;
- tabela de itens compacta e legível;
- contador/ordem de itens correto;
- redução de quebras de página desnecessárias;
- omissão de blocos que a regra atual já considera dispensáveis;
- visualização focada no DANFE;
- `Ctrl + scroll` para zoom somente no DANFE;
- impressão/salvar PDF pelo navegador;
- XML fiscal original intacto.

O módulo de DANFE fica isolado de transporte e Bridge.

## 10. Fernando Klein a preservar

Portar do projeto anterior:

- catálogo atual;
- aliases;
- regra que decide quando o mapeamento se aplica;
- comportamento para produto desconhecido;
- testes de regressão e fixture existente.

A transformação é somente de apresentação. `cProd` e XML fiscal original não são alterados.

## 11. Persistência

### Site

Sem histórico persistente. Pode manter apenas estado temporário da sessão atual para UX.

### Bridge

Persistência permitida somente para:

- identificação do certificado selecionado;
- preferências técnicas locais estritamente necessárias.

Não persistir histórico de chaves, XML ou NF-e.

Arquivos do fallback são temporários e devem ser apagados após conclusão/cancelamento.

## 12. Erros que a UI deve distinguir

- Bridge não instalado;
- acesso local bloqueado pelo navegador;
- Bridge indisponível;
- certificado não configurado;
- certificado vencido/inválido;
- chave inválida;
- NF-e sem XML disponível;
- consumo indevido/limite;
- SEFAZ indisponível;
- Portal indisponível;
- fallback/captcha cancelado;
- XML inválido ou incompatível com a chave;
- erro interno do Bridge.

## 13. Estrutura proposta

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

Código do projeto anterior será portado conscientemente, arquivo por arquivo. A árvore antiga não será copiada inteira.

## 14. Testes

### Site

- validação de chave;
- parsing XML;
- XML incompatível com a chave;
- Fernando Klein;
- regressões do DANFE;
- estados da UI;
- cliente da API do Bridge;
- fallback com Bridge mockado.

### Bridge

- bind somente loopback;
- CORS/Origin/Host;
- validação de chave;
- seleção de certificado;
- lookup com transporte mockado;
- ausência de retry inseguro;
- adapter WebView2 isolado;
- captura/validação/limpeza de temporários;
- URLs fixas do Portal;
- inexistência de endpoints LAN, lote, Central ou pareamento.

### CI

- build do site;
- typecheck/lint;
- testes do site;
- build .NET Release;
- testes .NET;
- regressões de segurança;
- artifact do Bridge Windows quando a pipeline de release for introduzida.

## 15. Migração seletiva do projeto anterior

### Portar

- visual/layout aprovado do site;
- DANFE e testes associados;
- `product-mapping`/Fernando Klein e testes;
- fixtures necessárias;
- parsing/validação XML comprovadamente reutilizável;
- partes úteis do transporte fiscal;
- partes úteis do fallback Portal/WebView2.

### Não portar

- Central;
- pareamento;
- fila compartilhada;
- shared lock/cooldown;
- leader election;
- group identity;
- servidor LAN;
- lote;
- login/autenticação de usuário;
- histórico/banco.

## 16. Critérios de aceite

A primeira versão está correta quando:

1. site detecta um Bridge instalado no PC atual;
2. site permite selecionar certificado local sem receber chave privada;
3. uma chave válida pode ser consultada por meio do Bridge;
4. XML volta ao site e o processamento visual ocorre no navegador;
5. Fernando Klein preserva o comportamento atual aprovado;
6. DANFE preserva o layout/comportamento atual aprovado;
7. não existe login, lote, Central, pareamento ou pasta compartilhada;
8. consumo indevido/limite conduz ao fallback correto;
9. WebView2 permite captcha manual e devolve XML ao site;
10. Bridge não é acessível pela LAN;
11. origem web não autorizada não consegue executar operações sensíveis;
12. CI fica verde;
13. teste físico em Windows confirma site + Bridge + A1 + Portal.

## 17. Revisão do design

Revisão de 2026-09-08:

- sem `TBD`/`TODO`;
- escopo compatível com uma única implementação incremental;
- responsabilidades de Site e Bridge separadas;
- API local versionada;
- porta local fixa;
- segurança de loopback explicitada;
- Portal isolado do fluxo fiscal normal;
- requisitos a preservar do projeto anterior explicitados;
- critérios de aceite objetivos.
