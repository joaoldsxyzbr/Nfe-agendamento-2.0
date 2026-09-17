# Fiscal Coordinator Rate Limit Design

## Objetivo

Adicionar proteção contra abuso aos endpoints públicos de coordenação fiscal do Worker Cloudflare sem alterar a arquitetura fiscal existente, sem enviar novos dados fiscais ao Cloudflare e sem reduzir a política conservadora que impede chamadas indevidas à SEFAZ.

## Escopo

Esta especificação cobre somente o hardening de:

- `POST /api/fiscal-coordination/reserve`;
- `POST /api/fiscal-coordination/block`.

A divisão gradual de `apps/web/src/main.ts`, ruleset da `main` e configuração real de Authenticode ficam fora deste escopo e terão planos independentes.

## Estado atual

O Worker valida método HTTP, exige `Authorization: Bearer <token>` no formato Base64URL de 43 caracteres, calcula SHA-256 do token e usa o hash como nome do `FiscalCoordinator` Durable Object. O token é uma identidade opaca derivada localmente do A1 RSA; o Worker não recebe CNPJ, chave NF-e, XML, PFX, senha ou chave privada.

Cada identidade fiscal já possui seu próprio controle transacional dentro do Durable Object para o limite funcional de consultas SEFAZ. Esse controle deve permanecer separado da nova proteção contra abuso HTTP.

## Correção de desenho durante a revisão

A primeira versão desta especificação propunha um segundo Durable Object com um bucket por identidade e rota. A revisão antes da implementação identificou um problema: como o bearer atual é validado somente pelo formato, um atacante poderia rotacionar tokens aleatórios e contornar um limite por identidade, além de continuar forçando a criação de novos namespaces.

Por isso, o desenho foi simplificado e endurecido antes de tocar no código: usar o **Rate Limiting binding nativo do Cloudflare Workers** como barreira global antes de qualquer acesso ao `FiscalCoordinator`.

Essa API já é suportada pela versão de Wrangler fixada no projeto. Ela não adiciona biblioteca externa, não cria Durable Objects de rate limiting e é adequada para proteção de tráfego HTTP. O limite fiscal exato continua no `FiscalCoordinator` e no `FiscalUsageGuard`; o rate limiting do Worker é somente uma camada de abuso e não deve ser usado para contabilidade fiscal.

## Requisitos

1. O comportamento fiscal existente de `FiscalCoordinator.reserve()` e `FiscalCoordinator.block()` não deve mudar.
2. O Worker não deve receber ou persistir CNPJ, chave NF-e, XML, PFX, senha ou chave privada.
3. Tokens inválidos devem continuar retornando `401` sem acessar o Durable Object fiscal.
4. Métodos diferentes de `POST` devem continuar retornando `405`.
5. Rotas desconhecidas sob `/api/fiscal-coordination/` devem continuar retornando `404`.
6. O rate limiting deve ocorrer depois das validações baratas de método/token/rota e antes de calcular/acessar o namespace fiscal.
7. Quando o limite HTTP for excedido, a resposta deve ser `429` com JSON estável e `Retry-After`.
8. Falha ou indisponibilidade do binding de rate limiting deve retornar `503` e não acessar o `FiscalCoordinator`.
9. Não adicionar dependências externas.
10. A lógica HTTP deve ser testável deterministicamente sem depender do tráfego real da Cloudflare.
11. A proteção HTTP não pode ser confundida com o teto fiscal de 20 tentativas por hora.

## Abordagem escolhida

Adicionar um binding `COORDINATION_RATE_LIMITER` no `wrangler.jsonc`, usando o Rate Limiting nativo do Workers.

A política será global para os dois endpoints fiscais, usando uma chave estável única (`fiscal-coordination`). Isso impede que simples rotação de bearer token gere uma quota HTTP nova por token antes de chegar ao Durable Object fiscal.

O handler HTTP da coordenação será extraído para um módulo pequeno e independente de `cloudflare:workers`. O `worker/index.ts` continuará responsável apenas por integrar bindings reais do runtime ao handler. Dessa forma, os contratos `401`, `404`, `405`, `429`, `503` e o caminho permitido podem ser testados com funções simples em Vitest.

## Política de limite

A proteção inicial será deliberadamente folgada para não interferir no uso interno legítimo:

- período: 60 segundos;
- limite: 300 requisições por período e por localização Cloudflare;
- chave: `fiscal-coordination`, compartilhada entre `reserve` e `block`;
- resposta ao exceder: `429`;
- `Retry-After`: `60` segundos;
- corpo JSON: `{ "error": "rate_limited", "retryAfterSeconds": 60 }`.

A API de rate limiting do Workers é local à localização Cloudflare e usa contadores eventualmente consistentes. Essa característica é aceitável aqui porque a finalidade é reduzir abuso HTTP e custo; ela não substitui o limite fiscal transacional e exato do Durable Object.

## Fluxo

```text
POST /api/fiscal-coordination/reserve|block
  -> validar método
  -> validar bearer token
  -> validar rota conhecida
  -> consultar COORDINATION_RATE_LIMITER
      -> negado: 429 + Retry-After: 60
      -> erro: 503, fail-safe
      -> permitido: continuar
  -> SHA-256(token)
  -> consultar FiscalCoordinator existente
  -> retornar decisão fiscal existente
```

Rotas fora de `/api/fiscal-coordination/*` continuam indo diretamente para `env.ASSETS.fetch(request)`.

## Falhas

Se `COORDINATION_RATE_LIMITER.limit(...)` lançar exceção ou retornar resultado inválido, o Worker deve responder `503` com `Cache-Control: no-store` e não acessar o `FiscalCoordinator`.

O Bridge já trata indisponibilidade/resposta inválida do coordenador de forma conservadora e segue pelo Portal; esse contrato não será alterado.

## Arquivos previstos

- `worker/fiscal-coordination-http.ts`: validações HTTP, rate-limit gate e despacho para `reserve`/`block` por dependências injetadas.
- `worker/index.ts`: integração do handler com `COORDINATION_RATE_LIMITER`, `FISCAL_COORDINATOR` e assets.
- `apps/web/tests/fiscal-coordinator-worker.test.ts`: testes determinísticos do handler HTTP.
- `apps/web/tests/deploy-config.test.ts`: validar configuração do binding de rate limiting.
- `wrangler.jsonc`: binding `ratelimits` do Worker.
- `docs/architecture/fiscal-usage-guard.md`: documentar a distinção entre proteção HTTP e limite fiscal.
- `README.md`: refletir a nova proteção na seção de segurança.

Não será criado um novo Durable Object para rate limiting.

## Testes de aceite

A implementação só será considerada concluída quando:

- uma requisição válida dentro do limite chegar ao `FiscalCoordinator` normalmente;
- uma negação do binding retornar `429` e `Retry-After: 60`;
- erro do binding retornar `503` e não executar operação fiscal;
- token inválido retornar `401` sem executar rate limiter ou operação fiscal;
- método inválido retornar `405` sem executar rate limiter ou operação fiscal;
- rota desconhecida retornar `404` sem executar rate limiter ou operação fiscal;
- `reserve` e `block` continuarem despachando para suas operações fiscais correspondentes;
- rota não fiscal continue indo para assets;
- `wrangler deploy --dry-run` aceite o binding;
- suíte web, build, CI fiscal e CodeQL continuem verdes.

## Não objetivos

- CAPTCHA, WAF ou Turnstile;
- armazenamento de IP;
- identificação de usuário final;
- autenticação criptográfica nova do bearer;
- alteração do limite fiscal de 20 tentativas/hora;
- alteração do derivador da identidade A1;
- mudança no Bridge, Portal ou DANFE;
- refatoração do frontend.

## Segurança e privacidade

O novo binding recebe somente a chave constante `fiscal-coordination`. O Worker continua sem registrar token, chave NF-e, XML ou material criptográfico do certificado. Nenhum novo dado fiscal ou pessoal é introduzido.
