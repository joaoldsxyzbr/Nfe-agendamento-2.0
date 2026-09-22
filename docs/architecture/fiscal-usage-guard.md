> **Documento histórico / superseded.** O componente Windows descrito abaixo foi removido da arquitetura atual em 22/09/2026. A fonte vigente é o README e a documentação extension-only.\n\n# Proteção fiscal local e compartilhada

A `main` posterior à v0.0.12 inclui duas camadas complementares para proteger consultas `NFeDistribuicaoDFe` feitas pelo Bridge:

1. `FiscalUsageGuard`, local por computador;
2. `FiscalCoordinator`, compartilhado entre computadores que usam o mesmo certificado A1 RSA.

A coordenação compartilhada não cria PC central, não move o certificado para a nuvem e não armazena CNPJ, chave NF-e ou XML.

## Gate fiscal local

`NfeLookupService` usa um `SemaphoreSlim` compartilhado pelo singleton `FiscalUsageGuard`. Assim, chamadas diretas à SEFAZ são serializadas no Bridge daquele PC mesmo quando duas abas tentam consultar ao mesmo tempo.

O gate envolve a pré-checagem local, a reserva compartilhada, o registro local da tentativa e a chamada ao transporte fiscal. O `CancellationToken` continua sendo respeitado.

## Idempotência local da operação

A partir da v0.0.18, o endpoint local `POST /api/v1/nfe/lookup` aceita opcionalmente um `requestId` UUID gerado pelo site para cada ação explícita de consulta.

O `NfeLookupOperationRegistry` envolve a chamada existente a `NfeLookupService.LookupAsync`; ele não altera o transporte SEFAZ, o `FiscalUsageGuard` nem a coordenação multi-PC.

Regras:

- cliente antigo sem `requestId` continua no comportamento legado;
- mesmo `requestId` + mesma chave reutiliza a mesma operação/resultado por até 2 minutos;
- mesmo `requestId` + chave diferente retorna conflito e não consulta a SEFAZ;
- requestIds diferentes para a mesma chave **enquanto ela está em voo** compartilham uma única execução fiscal;
- desconexão ou cancelamento HTTP de um consumidor não cancela a operação fiscal compartilhada; o lifecycle moderno fica vinculado ao encerramento do Bridge;
- depois que a operação termina, um novo requestId representa nova ação explícita e pode iniciar nova consulta, sujeita normalmente aos guards fiscais;
- o registry mantém no máximo 256 entradas e remove terminais expirados antes de admitir novas;
- encerramento do Bridge ou falha excepcional da factory remove a entrada em vez de fabricar resultado;
- não existe retry fiscal automático.

Essa camada evita dupla tentativa causada por repetição/concorrência da mesma operação, mas não substitui a contabilidade conservadora do `FiscalUsageGuard` e do `FiscalCoordinator`.

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

## Coordenação multi-PC

O site Cloudflare expõe somente dois endpoints internos ao Bridge:

```text
POST /api/fiscal-coordination/reserve
POST /api/fiscal-coordination/block
```

O Worker usa um Durable Object SQLite chamado `FiscalCoordinator`. Cada identidade coordenada tem armazenamento transacional e fortemente consistente, permitindo reservar tentativas de forma atômica entre vários computadores.

Antes de consultar a SEFAZ, o Bridge:

1. valida localmente o A1 e lê a identidade fiscal;
2. verifica a proteção local;
3. deriva uma credencial opaca a partir de uma assinatura RSA/SHA-256 feita pela chave privada do A1 sobre um contexto fixo do aplicativo;
4. envia somente essa credencial no header `Authorization: Bearer` por HTTPS;
5. o Worker aplica SHA-256 novamente à credencial e usa somente esse digest como nome do Durable Object;
6. o Durable Object reserva atomicamente uma posição na janela compartilhada;
7. somente após a reserva o Bridge registra a tentativa local e chama a SEFAZ.

A chave privada nunca sai do Windows. O coordenador não recebe CNPJ, chave NF-e, XML, PFX, senha, thumbprint ou conteúdo fiscal. A credencial não é gravada pelo código do Worker; somente seu SHA-256 é usado para selecionar o objeto.

A credencial é estável para cópias do mesmo A1 RSA, então PCs com o mesmo certificado compartilham a mesma janela. Certificados diferentes não compartilham identidade remota, mesmo que pertençam ao mesmo CNPJ. Essa é uma limitação deliberada para não enviar o CNPJ nem criar uma associação remota de identidade fiscal. No uso previsto do projeto, os computadores que precisam compartilhar o teto usam o mesmo A1.

Certificados sem chave RSA não têm uma derivação estável segura implementada. Nesse caso a coordenação falha fechada e a consulta segue pelo Portal em vez de arriscar chamada direta sem proteção compartilhada.

## Barreira HTTP contra abuso

Antes de calcular o namespace fiscal ou acessar `FiscalCoordinator`, o Worker aplica o binding nativo `COORDINATION_RATE_LIMITER` do Cloudflare Workers como uma barreira grosseira contra abuso e custo.

Política atual:

- chave de abuso derivada do `CF-Connecting-IP` do cliente, sem dado fiscal;
- limite: 60 requisições por 60 segundos por chave de IP no binding;
- `429` com `Retry-After: 60` quando o limiter negar;
- `503` quando o binding falhar ou retornar resultado inválido;
- nenhum caminho `429`/`503` por esse gate acessa o `FiscalCoordinator`.

O rate limiter HTTP **não** é o mecanismo de contabilidade fiscal. Seus contadores podem ser aproximados e distribuídos pela infraestrutura Cloudflare. O teto fiscal conservador e exato continua pertencendo ao `FiscalUsageGuard` local e ao `FiscalCoordinator` transacional.

A ordem do Worker é: validar método, formato do bearer e rota conhecida; aplicar o rate limiter por IP; somente depois calcular SHA-256 da credencial e acessar o Durable Object. O limiter recebe apenas o IP técnico fornecido pela borda Cloudflare; esta camada não adiciona CNPJ, chave NF-e, XML, PFX, senha, thumbprint ou chave privada ao tráfego Cloudflare.

O Worker **não autentica criptograficamente que um bearer foi gerado por um A1**: ele valida o formato e usa o hash da credencial como namespace. Provar essa origem remotamente exigiria um protocolo adicional de registro/desafio e alteraria a fronteira de privacidade atual. O hardening HTTP, portanto, é uma barreira contra abuso/custo; a proteção fiscal exata continua no par `FiscalUsageGuard` + `FiscalCoordinator`.

## Janela e limite

A janela operacional continua em uma hora, com teto de 20 tentativas diretas por identidade coordenada. A reserva acontece **antes** da comunicação fiscal. Se a chamada seguinte falhar de forma ambígua, a tentativa continua contabilizada de forma conservadora nos demais PCs.

O estado do Durable Object contém apenas:

- timestamps UTC das reservas ainda dentro da janela;
- `blockedUntilUtc` quando houver cooldown compartilhado.

O teto fiscal protege a rota SEFAZ e é independente do limite operacional da interface. A interface aceita no máximo **100 NF-e válidas por lote** para limitar uso de memória; dentro desse teto, o lote muda para Portal quando recebe `consumption_limit`.

## Eventos de bloqueio

Ativam proteção local e/ou compartilhada:

- HTTP 429 do transporte;
- `cStat 656` da SEFAZ;
- atingimento do teto local;
- atingimento do teto compartilhado;
- estado local corrompido/ilegível.

Ao observar 429 ou `656`, o Bridge salva o bloqueio local e tenta propagá-lo ao coordenador compartilhado por uma hora. Se a propagação falhar, o estado local continua protegido e o erro é registrado sem repetir a chamada fiscal.

## Fail-safe

A coordenação compartilhada é obrigatória quando habilitada em produção. Se o Worker estiver indisponível, responder de forma inválida ou exceder o timeout, `NfeLookupService` retorna `consumption_limit` **antes de tocar na SEFAZ**. O frontend então usa o Portal.

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

O Worker continua servindo os assets estáticos do site. Somente `/api/fiscal-coordination/*` passa primeiro pelo código do Worker. A barreira HTTP usa o Rate Limiting binding nativo e o `FiscalCoordinator` usa Durable Object com armazenamento SQLite.

Configuração: `wrangler.jsonc`.
Implementação: `worker/index.ts`, `worker/fiscal-coordination-http.ts` e `worker/fiscal-coordinator-core.ts`.

## Testes

Cobertura relevante:

- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/FiscalUsageGuardTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupUsageGuardTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupOperationRegistryTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupEndpointIntegrationTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupSharedCoordinatorTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/FiscalCoordinationCredentialTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/CloudFiscalUsageCoordinatorTests.cs`;
- `apps/web/tests/fiscal-coordinator-core.test.ts`;
- `apps/web/tests/fiscal-coordinator-worker.test.ts`;
- `apps/web/tests/deploy-config.test.ts`.

A aceitação física da consulta em lote continua em `docs/testing/batch-query.md`.
