# Portal via extensão de navegador (Manifest V3) — Design

**Data:** 2026-09-21  
**Status:** aprovado para implementação em piloto  
**Baseline:** `main` em `3f8621e0eb3f0ddaf3a2e539f6d892b84ebb7edf` / release pública v0.0.20

## Objetivo

Substituir a experiência visual do helper WinForms/WebView2 por uma extensão de navegador no estilo do fluxo público do FSist: o usuário trabalha pelo site, o Portal Nacional abre em uma janela do próprio Chrome/Edge, a chave da NF-e é preenchida automaticamente, o hCaptcha continua manual e o XML retorna ao site para passar pelo pipeline atual de validação, parser, DANFE e lote.

A primeira implementação é um **piloto reversível**. O Bridge e o helper WebView2 continuam disponíveis como fallback técnico até a extensão provar o fluxo completo em Windows real. Nenhuma proteção fiscal atual é removida nesta etapa.

## Estado atual

A v0.0.20 possui:

- site Vite/TypeScript como interface principal;
- Bridge local em `127.0.0.1:17345`;
- consulta direta SEFAZ via `NFeDistribuicaoDFe`;
- `FiscalUsageGuard`, coordenação multi-PC, idempotência e coalescência;
- seleção de A1 em `CurrentUser/My`;
- helper Portal WinForms/WebView2 persistente;
- fallback Portal após `consumption_limit` ou `cStat 217`;
- hCaptcha manual;
- validação do XML contra a chave consultada;
- importação manual de XML como contingência;
- regras locais de fornecedor resolvidas pelo Bridge.

O helper atual é tecnicamente funcional, porém ainda aparece como uma janela de aplicativo. A meta desta migração é fazer o Portal parecer parte do fluxo do navegador.

## Referência externa

O FSist informa publicamente que sua consulta por chave usa uma extensão do Google Chrome para auxiliar a geração de XML/DANFE pela consulta pública da Fazenda e exige certificado digital instalado no Windows quando necessário.

A implementação deste projeto será própria. Nenhum código, pacote, seletor privado ou comportamento interno do FSist será copiado.

## Decisão arquitetural

### Fase piloto

```text
Usuário
  ↓
Site NFe Agendamento
  ├─ consulta direta existente via Bridge
  ├─ lote, DANFE, XML/ZIP e mensagens
  └─ cliente da extensão
          ↓
      Extensão Chrome/Edge MV3
          ↓
      Popup do navegador
          ↓
      Portal Nacional da NF-e
          ↓
      certificado A1 instalado no Windows
```

Quando o Portal for necessário:

1. o site pede à extensão para iniciar uma operação com uma chave validada;
2. a extensão abre uma janela popup do navegador no Portal oficial;
3. um content script limitado ao host oficial preenche a chave;
4. o usuário resolve o hCaptcha manualmente;
5. a extensão observa somente estados e controles esperados do Portal;
6. após a consulta, a extensão tenta obter o XML dentro da própria sessão autenticada do Portal;
7. o XML é devolvido ao site por um canal de mensagens autenticado por origem/operação;
8. o site executa o mesmo parser e validação atuais;
9. a janela do Portal é encerrada somente quando a operação termina ou o usuário cancela.

### Fases posteriores

Somente após validação física da extensão:

- tornar a extensão o caminho padrão do Portal;
- remover o helper WebView2 do instalador;
- em mudança separada, avaliar se ainda existe motivo para manter o Bridge;
- remover o Bridge somente se consulta direta, regras locais, segurança e coordenação tiverem substitutos equivalentes ou forem conscientemente descartadas.

A retirada do Bridge não faz parte deste piloto.

## Manifest V3

A extensão será criada em `apps/extension` e usará Manifest V3.

Permissões mínimas planejadas:

- `scripting`;
- `webRequest` apenas para observar a requisição oficial de download do XML;
- `storage` para persistir o estado efêmero da operação em `chrome.storage.session` enquanto o service worker pode ser suspenso;
- host permissions estritas para `https://www.nfe.fazenda.gov.br/*` e para o domínio oficial do NFe Agendamento;
- content script no site oficial para fazer a ponte com o service worker sem depender de um ID de extensão hardcoded.

Não usar:

- `<all_urls>`;
- `externally_connectable` no piloto;
- permissões de leitura arbitrária do disco;
- `downloads` para ler histórico/arquivos;
- Native Messaging;
- automação de captcha;
- `webRequestBlocking`;
- permissões administrativas desnecessárias.

## Comunicação site ↔ extensão

O site não deve depender de um ID hardcoded. Um content script injetado somente no domínio oficial atua como ponte entre a página e o service worker da extensão.

Fluxo do canal:

1. o site publica uma mensagem em `window.postMessage` com marcador e schema próprios;
2. o content script valida `event.source === window`, `event.origin` e o schema;
3. o content script encaminha apenas comandos conhecidos por `chrome.runtime.sendMessage`;
4. o service worker responde;
5. o content script devolve a resposta ao mesmo `window`;
6. o cliente do site correlaciona por `requestId`.

Contrato lógico:

```ts
type PortalExtensionRequest =
  | { type: 'ping'; requestId: string }
  | { type: 'start'; requestId: string; accessKey: string }
  | { type: 'cancel'; requestId: string; operationId: string };

type PortalExtensionResponse =
  | { type: 'ready'; requestId: string; version: string }
  | { type: 'started'; requestId: string; operationId: string }
  | { type: 'state'; operationId: string; state: PortalExtensionState; message?: string }
  | { type: 'completed'; operationId: string; xml: string }
  | { type: 'failed'; operationId: string; code: string; message: string };
```

Estados internos:

```text
opening
loading_portal
waiting_user
submitting
waiting_result
fetching_xml
completed
cancelled
failed
```

O site continua expondo ao restante da aplicação um contrato simples compatível com o atual:

```text
waiting_for_user | completed | failed | cancelled
```

Assim, consultation controller e batch controller não precisam conhecer detalhes da extensão.

## Segurança do canal

### Site

O content script da ponte existe apenas na origem oficial:

`https://nfeagendamento.joaolds.xyz.br/*`

Ele aceita mensagens somente da própria janela e da origem esperada, valida tipos/campos antes de encaminhar e não expõe uma API genérica de `fetch`, criação de tabs ou execução de scripts.

Nenhuma outra página web pode iniciar operações.

### Portal

Content scripts rodam somente no host oficial:

`https://www.nfe.fazenda.gov.br/*`

A lógica reconhece apenas os paths explicitamente usados pela consulta NF-e. Navegação para outro host encerra a operação como falha.

### Operações

Cada operação possui:

- `operationId` aleatório;
- chave NF-e validada antes de abrir o Portal;
- associação entre popup/tab e operação;
- timeout de lifecycle;
- limpeza de estado ao concluir/cancelar;
- no máximo uma operação Portal ativa por janela/perfil na primeira versão.

Mensagens recebidas do site ou dos content scripts são validadas por schema e origem antes de alterar estado.

## Certificado digital

A extensão não lê, exporta, serializa nem armazena a chave privada do A1.

A autenticação TLS/certificado continua sendo responsabilidade do navegador e do Windows ao acessar o Portal Nacional. A extensão apenas opera a página autorizada depois que o navegador estabelece a sessão.

Nenhum PFX, senha, PEM, chave privada ou material criptográfico é enviado ao site.

## hCaptcha

O hCaptcha continua 100% manual.

Proibido:

- resolver captcha automaticamente;
- usar serviço externo de resolução;
- fabricar token;
- chamar `hcaptcha.execute` / `grecaptcha.execute` com finalidade de contorno;
- clicar ou interagir dentro do desafio.

A extensão pode somente detectar que a resposta humana já existe e então acionar o botão oficial de continuação, comportamento equivalente ao helper atual.

## Obtenção do XML

A extensão tentará obter o XML sem ler o arquivo baixado no Windows.

Estratégia preferida:

1. reconhecer que a página oficial terminou a consulta;
2. acionar somente o controle oficial de download já identificado;
3. o service worker observa, via `webRequest` não bloqueante e limitado ao host/path oficial, a requisição real de download;
4. capturar somente URL, método e corpo necessário daquela requisição;
5. reproduzir a mesma requisição a partir do service worker com `fetch`, usando a sessão/cookies do host permitidos pelo navegador;
6. receber o corpo XML em memória;
7. validar limite de 10 MiB e estrutura mínima na extensão;
8. enviar somente o XML ao site;
9. o site executa a validação canônica atual contra a chave consultada.

O listener ignora requisições iniciadas pela própria extensão para impedir recursão e rejeita qualquer host/path fora da allowlist.

A extensão **não** ganha acesso genérico ao sistema de arquivos nem permissão de histórico de downloads.

Se o Portal impedir a reprodução segura da requisição na sessão real, o piloto deve falhar de forma explícita e preservar o helper WebView2 como fallback. Não será criada uma permissão invasiva apenas para contornar esse limite.

## Integração no site

Criar um adaptador `BrowserPortalExtensionController` com a mesma superfície usada pelos controladores atuais:

```ts
start(accessKey, signal?) -> operationId
waitForResult(operationId, signal?) -> PortalOperationStatus
cancel(operationId)
```

Criar um `PortalRouter`:

1. usa extensão quando ela está instalada, compatível e responde ao handshake;
2. se indisponível, usa o `PortalFallbackController` atual do Bridge;
3. nunca abre os dois caminhos para a mesma operação;
4. não executa retry fiscal;
5. registra somente estado técnico, sem chave/XML.

O site deve indicar de forma curta quando está usando:

- `Portal pelo navegador`;
- `Portal pelo componente local` como fallback temporário.

## Lote

O lote continua sequencial.

Para cada NF-e que exigir Portal:

1. abre/reutiliza o fluxo da extensão;
2. aguarda conclusão;
3. fecha/limpa a operação;
4. passa ao próximo item.

Não abrir múltiplos popups Portal simultâneos.

## Compatibilidade

### Sem extensão

O site continua funcionando como v0.0.20 e usa o helper WebView2.

### Extensão antiga/incompatível

Handshake falha com mensagem controlada e o site usa o helper atual.

### Bridge ausente

Nesta fase, a consulta direta continua dependendo do Bridge. A extensão não mascara esse requisito ainda.

### Chrome/Edge

A primeira versão suporta Chromium compatível com Manifest V3. Firefox não entra no escopo inicial.

## Estrutura de arquivos

```text
apps/extension/
  manifest.json
  src/
    background.ts
    protocol.ts
    site-bridge.ts
    portal-content.ts
    portal-dom.ts
    portal-session.ts
    portal-request.ts
  tests/
    protocol.test.ts
    portal-dom.test.ts
    security.test.ts
  tsconfig.json
  package.json

apps/web/src/portal/
  extension-client.ts
  router.ts
  fallback.ts            # preservado

apps/web/tests/
  portal-extension.test.ts
  portal-router.test.ts
  portal-integration.test.ts
```

Se a implementação mostrar que um arquivo ficou com responsabilidades demais, dividir por responsabilidade, não por camada artificial.

## Testes

### Extensão

Cobrir:

- manifesto MV3 e permissões mínimas;
- allowlist do domínio do site;
- allowlist do Portal oficial;
- validação de mensagens;
- lifecycle das operações;
- preenchimento da chave;
- detecção do hCaptcha resolvido sem resolver captcha;
- reconhecimento restrito dos controles oficiais;
- rejeição de navegação externa;
- limite de tamanho do XML;
- limpeza após cancelamento/falha.

### Site

Cobrir:

- handshake extensão presente/ausente;
- roteamento extensão → fallback Bridge;
- consulta unitária;
- lote sequencial;
- cancelamento;
- XML retornado reutilizando o parser atual;
- extensão indisponível sem regressão;
- nenhuma chamada Portal duplicada.

### CI

Adicionar build/test da extensão ao workflow existente.

O pacote da extensão deve ser gerado como artifact de CI, sem publicação automática na Chrome Web Store nesta primeira etapa.

## Distribuição piloto

Primeira distribuição:

- ZIP produzido pelo CI;
- instalação manual em modo de desenvolvedor para teste interno;
- instruções documentadas;
- sem publicação pública na Chrome Web Store até validar o fluxo real.

Depois da validação:

- preparar publicação Chrome Web Store;
- testar Edge com o mesmo pacote/manifest;
- só então tornar a extensão requisito normal do produto.

## Telemetria/logs

Sem telemetria remota nova.

Logs técnicos podem conter:

- versão da extensão;
- estado;
- duração;
- código interno de falha;
- rota usada (extension/bridge fallback).

Não podem conter:

- chave NF-e completa;
- XML;
- CNPJ/CPF;
- thumbprint;
- dados do certificado;
- token/cookie do Portal.

## Rollback

Rollback imediato é manter o comportamento da v0.0.20:

- extensão indisponível → helper WebView2;
- extensão falha antes de obter XML → helper WebView2 em nova ação explícita/controlada;
- extensão não consegue usar o certificado → helper WebView2;
- mudança no DOM do Portal → extensão falha fechada, sem seletores genéricos.

Nenhuma etapa do piloto remove arquivos ou contratos do helper atual.

## Fora do escopo desta implementação

- remover Bridge;
- remover consulta direta SEFAZ;
- mudar `FiscalUsageGuard`;
- mudar coordenação Cloudflare;
- mover regras privadas de fornecedor;
- alterar DANFE;
- alterar parser fiscal;
- resolver captcha;
- publicar automaticamente na Chrome Web Store;
- suportar Firefox;
- Native Messaging;
- acesso genérico ao sistema de arquivos.

## Critério de conclusão técnica

O piloto está tecnicamente implementado quando:

1. extensão MV3 compila e possui testes automatizados;
2. site detecta extensão e a prefere para Portal;
3. ausência/falha da extensão preserva helper atual;
4. consulta unitária e lote continuam usando o mesmo pipeline de XML/DANFE;
5. CI cobre site, Bridge e extensão;
6. documentação de instalação/teste está atualizada;
7. nenhuma proteção fiscal existente foi removida.

## Critério de validação física

Em Windows real com Chrome/Edge e A1 válido:

1. instalar a extensão;
2. abrir o site oficial;
3. provocar/usar um caso legítimo que entre no Portal;
4. confirmar popup do navegador;
5. confirmar chave preenchida;
6. resolver hCaptcha manualmente;
7. confirmar seleção/uso do certificado pelo navegador;
8. confirmar retorno do XML ao site;
9. confirmar DANFE e download XML;
10. repetir uma segunda operação;
11. validar lote com pelo menos duas NF-e que usem o Portal;
12. confirmar que, com extensão desabilitada, o helper atual continua funcionando.

Somente depois dessa validação física deve ser planejada a remoção do helper WebView2.
