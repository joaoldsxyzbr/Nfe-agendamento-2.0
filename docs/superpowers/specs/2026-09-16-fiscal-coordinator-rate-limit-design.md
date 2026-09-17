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

Cada identidade fiscal já possui seu próprio controle transacional dentro do Durable Object para o limite funcional de consultas SEFAZ. Esse controle deve permanecer separado do novo mecanismo de proteção contra abuso HTTP.

## Requisitos

1. O comportamento fiscal existente de `FiscalCoordinator.reserve()` e `FiscalCoordinator.block()` não deve mudar.
2. O Worker não deve receber ou persistir CNPJ, chave NF-e, XML, PFX, senha ou chave privada.
3. Tokens inválidos devem continuar retornando `401` sem criar/acessar Durable Object fiscal.
4. Métodos diferentes de `POST` devem continuar retornando `405`.
5. Rotas desconhecidas sob `/api/fiscal-coordination/` devem continuar retornando `404`.
6. O rate limiting deve ocorrer antes da operação fiscal no Durable Object.
7. Quando o limite HTTP for excedido, a resposta deve ser `429` com JSON estável e `Retry-After`.
8. Falha ou indisponibilidade do mecanismo de rate limiting não pode liberar chamadas de coordenação sem controle. O comportamento deve ser conservador.
9. Não adicionar dependências externas para implementar o limite.
10. O mecanismo deve ser testável deterministicamente sem depender do relógio real ou de tráfego Cloudflare real.

## Abordagem escolhida

Usar um segundo Durable Object, dedicado somente ao rate limiting HTTP, separado do `FiscalCoordinator` fiscal.

O Worker continuará calculando `namespace = SHA-256(token)` para o coordenador fiscal. Para o rate limiter, usará um bucket derivado da mesma identidade opaca e da rota solicitada. Assim, um cliente legítimo pode usar `reserve` e `block` sem compartilhar estado com tokens aleatórios, enquanto cada identidade fica limitada a uma taxa operacional compatível com o uso do Bridge.

O novo Durable Object terá estado mínimo e transacional, sem armazenar o token original. Seu core será implementado como função pura em arquivo separado, seguindo o padrão já usado por `fiscal-coordinator-core.ts`, para permitir testes unitários determinísticos.

## Política de limite

A política inicial será simples e intencionalmente folgada para não interferir no fluxo legítimo:

- janela fixa de 60 segundos;
- até 60 requisições por identidade opaca e por rota dentro da janela;
- excedido o limite, retornar `429` até o fim da janela;
- `Retry-After` em segundos inteiros, mínimo 1.

Esse limite é de proteção HTTP, não o teto fiscal de 20 tentativas/hora. O teto fiscal continua sendo controlado exclusivamente pelo `FiscalCoordinator` e pelo `FiscalUsageGuard` local.

## Fluxo

```text
POST /api/fiscal-coordination/reserve|block
  -> validar método
  -> validar bearer token
  -> validar rota conhecida
  -> SHA-256(token)
  -> consultar RateLimitCoordinator da identidade + rota
      -> negado: 429 + Retry-After
      -> permitido: continuar
  -> consultar FiscalCoordinator existente
  -> retornar decisão fiscal existente
```

## Falhas

Se o rate limiter lançar exceção, retornar `503` com `Cache-Control: no-store` e não chamar o `FiscalCoordinator`. Isso preserva o princípio fail-safe já usado pelo projeto: falha de coordenação remota não deve resultar em chamada direta desprotegida à SEFAZ.

O Bridge já trata indisponibilidade/resposta inválida do coordenador de forma conservadora e segue pelo Portal; esse contrato não será alterado.

## Arquivos previstos

- `worker/rate-limit-core.ts`: regra pura de janela/contagem e cálculo de retry.
- `worker/index.ts`: integração do novo gate antes de `reserve`/`block`.
- `apps/web/tests/rate-limit-core.test.ts`: testes unitários do core.
- `apps/web/tests/fiscal-coordinator-worker.test.ts` ou teste equivalente existente: testes de integração do Worker para `401`, `404`, `405`, `429`, `503` e caminho permitido.
- `wrangler.jsonc`: binding/migration do novo Durable Object, somente se necessário pela configuração atual do projeto.
- `docs/architecture/fiscal-usage-guard.md`: documentar a distinção entre rate limiting HTTP e limite fiscal.
- `README.md`: refletir a nova proteção na seção de segurança, sem alterar a arquitetura descrita.

## Testes de aceite

A implementação só será considerada concluída quando:

- requisições dentro do limite chegarem ao `FiscalCoordinator` normalmente;
- a 61ª requisição da mesma identidade/rota na mesma janela retornar `429`;
- outra identidade não herdar o limite da primeira;
- `reserve` e `block` tenham buckets independentes;
- após o fim da janela, a identidade volte a ser aceita;
- `Retry-After` seja coerente com a janela restante;
- token inválido não acione nenhum Durable Object;
- falha do rate limiter retorne `503` e não execute operação fiscal;
- suíte web, build, `wrangler deploy --dry-run`, CI fiscal e CodeQL continuem verdes.

## Não objetivos

- CAPTCHA, WAF ou Turnstile;
- armazenamento de IP;
- identificação de usuário final;
- alteração do limite fiscal de 20 tentativas/hora;
- alteração do derivador da identidade A1;
- mudança no Bridge, Portal ou DANFE;
- refatoração do frontend.

## Segurança e privacidade

O rate limiter recebe apenas a mesma identidade opaca já usada na coordenação, transformada em SHA-256 antes de ser usada como namespace. Nenhum novo dado fiscal ou pessoal é introduzido. O Worker continua sem registrar token, chave NF-e, XML ou material criptográfico do certificado.
