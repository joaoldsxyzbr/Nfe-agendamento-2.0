# Proteção fiscal local e compartilhada

A `main` posterior à v0.0.12 inclui duas camadas fiscais complementares para proteger consultas `NFeDistribuicaoDFe` feitas pelo Bridge:

1. `FiscalUsageGuard`, local por computador;
2. `FiscalCoordinator`, compartilhado entre computadores que usam o mesmo certificado A1 RSA.

Além delas, os endpoints públicos do coordenador passam por uma barreira de **rate limiting HTTP** da Cloudflare antes de qualquer acesso ao Durable Object fiscal. Essa barreira reduz abuso de tráfego e custo, mas não participa da contabilidade fiscal.

A coordenação compartilhada não cria PC central, não move o certificado para a nuvem e não armazena CNPJ, chave NF-e ou XML.

## Gate fiscal local

`NfeLookupService` usa um `SemaphoreSlim` compartilhado pelo singleton `FiscalUsageGuard`. Assim, chamadas diretas à SEFAZ são serializadas no Bridge daquele PC mesmo quando duas abas tentam consultar ao mesmo tempo.

O gate envolve a pré-checagem local, a reserva compartilhada, o registro local da tentativa e a chamada ao transporte fiscal. O `CancellationToken` continua sendo respeitado.

## Estado persistido local

Arquivo:

```text
%LOCALAPPDATA%\NfeAgendamentoBridge\fiscal-usage.json
```

O estado contém somente:

- versão do formato;
- SHA-256 do CNPJ como chave interna;
- timestamps UTC das tentativas diretas recentes;
- `blockedUntilUtc` quando houver proteção ativa;
- `globalBlockedUntilUtc` somente quando for necessário recuperar de estado local ilegível.

Não são persistidos CNPJ em texto puro, chave NF-e, XML, PFX, senha ou chave privada.

A escrita usa arquivo temporário, `FileOptions.WriteThrough`, flush físico e substituição somente depois da gravação concluída. Se o JSON estiver corrompido ou ilegível, o guard falha de forma conservadora por uma hora (`state_recovery`) e direciona a consulta ao Portal.

## Endpoints do coordenador

O site Cloudflare expõe somente dois endpoints internos ao Bridge:

```text
POST /api/fiscal-coordination/reserve
POST /api/fiscal-coordination/block
```

Antes de chegar ao `FiscalCoordinator`, uma requisição precisa passar por validação de método, bearer e rota conhecida. Em seguida o Worker consulta o binding nativo `COORDINATION_RATE_LIMITER` da Cloudflare.

### Rate limiting HTTP

A política atual é:

- chave global: `fiscal-coordination`;
- 300 requisições por período de 60 segundos;
- `reserve` e `block` compartilham a mesma quota HTTP;
- negação retorna HTTP `429`, JSON estável e `Retry-After: 60`;
- erro/indisponibilidade do rate limiter retorna `503` e falha fechado, sem acessar o Durable Object fiscal.

O rate limiting nativo do Workers é local à localização Cloudflare e usa contadores eventualmente consistentes. Portanto ele é tratado somente como proteção **best-effort contra abuso HTTP**. Ele não substitui nem altera o teto fiscal de 20 tentativas/hora, que continua transacional e conservador no `FiscalCoordinator`/`FiscalUsageGuard`.

A chave usada pelo rate limiter é constante e não contém token, CNPJ, chave NF-e, XML ou qualquer dado do certificado. Nenhum novo dado fiscal ou pessoal é introduzido por essa camada.

## Coordenação multi-PC

O Worker usa um Durable Object SQLite chamado `FiscalCoordinator`. Cada identidade coordenada tem armazenamento transacional e fortemente consistente, permitindo reservar tentativas de forma atômica entre vários computadores.

Antes de consultar a SEFAZ, o Bridge:

1. valida localmente o A1 e lê a identidade fiscal;
2. verifica a proteção local;
3. deriva uma credencial opaca a partir de uma assinatura RSA/SHA-256 feita pela chave privada do A1 sobre um contexto fixo do aplicativo;
4. envia somente essa credencial no header `Authorization: Bearer` por HTTPS;
5. o Worker valida a requisição e aplica o rate limiting HTTP global;
6. somente depois do gate HTTP o Worker aplica SHA-256 novamente à credencial e usa somente esse digest como nome do Durable Object;
7. o Durable Object reserva atomicamente uma posição na janela compartilhada;
8. somente após a reserva o Bridge registra a tentativa local e chama a SEFAZ.

A chave privada nunca sai do Windows. O coordenador não recebe CNPJ, chave NF-e, XML, PFX, senha, thumbprint ou conteúdo fiscal. A credencial não é gravada pelo código do Worker; somente seu SHA-256 é usado para selecionar o objeto.

A credencial é estável para cópias do mesmo A1 RSA, então PCs com o mesmo certificado compartilham a mesma janela. Certificados diferentes não compartilham identidade remota, mesmo que pertençam ao mesmo CNPJ. Essa é uma limitação deliberada para não enviar o CNPJ nem criar uma associação remota de identidade fiscal. No uso previsto do projeto, os computadores que precisam compartilhar o teto usam o mesmo A1.

Certificados sem chave RSA não têm uma derivação estável segura implementada. Nesse caso a coordenação falha fechada e a consulta segue pelo Portal em vez de arriscar chamada direta sem proteção compartilhada.

## Janela e limite fiscal

A janela operacional continua em uma hora, com teto de 20 tentativas diretas por identidade coordenada. A reserva acontece **antes** da comunicação fiscal. Se a chamada seguinte falhar de forma ambígua, a tentativa continua contabilizada de forma conservadora nos demais PCs.

O estado do Durable Object contém apenas:

- timestamps UTC das reservas ainda dentro da janela;
- `blockedUntilUtc` quando houver cooldown compartilhado.

O teto é proteção da rota SEFAZ, não limite de tamanho do lote. O lote pode conter mais itens e muda para Portal quando recebe `consumption_limit`.

## Eventos de bloqueio

Ativam proteção local e/ou compartilhada:

- HTTP 429 do transporte;
- `cStat 656` da SEFAZ;
- atingimento do teto local;
- atingimento do teto compartilhado;
- estado local corrompido/ilegível.

O HTTP `429` emitido pelo **rate limiter do Worker** é uma proteção de tráfego separada. Para o Bridge ele representa indisponibilidade temporária do coordenador e continua sendo tratado conservadoramente sem liberar chamada direta à SEFAZ.

Ao observar 429 ou `656` do transporte fiscal, o Bridge salva o bloqueio local e tenta propagá-lo ao coordenador compartilhado por uma hora. Se a propagação falhar, o estado local continua protegido e o erro é registrado sem repetir a chamada fiscal.

## Fail-safe

A coordenação compartilhada é obrigatória quando habilitada em produção. Se o Worker estiver indisponível, responder de forma inválida, o rate limiter falhar/recusar a chamada ou o timeout for excedido, `NfeLookupService` retorna `consumption_limit` **antes de tocar na SEFAZ**. O frontend então usa o Portal.

Configuração padrão do Bridge:

```json
{
  "Bridge": {
    "FiscalCoordination": {
      "Enabled": true,
      "BaseUrl": "https://nfeagendamento.joaolds.xyz.br/api/fiscal-coordination/"
    }
  }
}
```

`Enabled=false` existe apenas para diagnóstico/teste controlado. Desabilitar a coordenação em vários PCs remove a proteção compartilhada e não é recomendado em produção.

## Integração com consulta única e lote

A API local permanece `/api/v1/nfe/lookup`. O frontend não precisa conhecer o coordenador remoto. Proteção local, compartilhada ou indisponibilidade conservadora chegam como `consumption_limit` e reutilizam o fallback Portal existente.

No lote, ao receber `consumption_limit`:

- a NF-e atual passa ao Portal;
- a rota do restante do lote muda para Portal;
- nenhuma chave restante tenta a SEFAZ naquele lote;
- hCaptcha continua manual para cada operação Portal.

## Cloudflare

O Worker continua servindo os assets estáticos do site. Somente `/api/fiscal-coordination/*` passa primeiro pelo código do Worker. O Durable Object fiscal usa armazenamento SQLite. O rate limiting HTTP usa o binding nativo `ratelimits` configurado em `wrangler.jsonc`, sem criar um segundo Durable Object e sem persistir estado fiscal adicional.

Configuração: `wrangler.jsonc`.
Implementação HTTP: `worker/fiscal-coordination-http.ts` e `worker/index.ts`.
Implementação fiscal: `worker/fiscal-coordinator-core.ts`.

## Testes

Cobertura relevante:

- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/FiscalUsageGuardTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupUsageGuardTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupSharedCoordinatorTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/FiscalCoordinationCredentialTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/CloudFiscalUsageCoordinatorTests.cs`;
- `apps/web/tests/fiscal-coordinator-core.test.ts`;
- `apps/web/tests/fiscal-coordinator-worker.test.ts`;
- `apps/web/tests/deploy-config.test.ts`.

A aceitação física da consulta em lote continua em `docs/testing/batch-query.md`.
