# Proteção fiscal local

A `main` posterior à v0.0.12 inclui `FiscalUsageGuard` para proteger consultas `NFeDistribuicaoDFe` feitas pelo Bridge local.

## Escopo

A proteção existe por computador e por identidade fiscal do certificado. Ela não cria Central, não compartilha certificado, não persiste XML e não coordena consumo entre PCs diferentes.

## Gate fiscal

`NfeLookupService` usa um `SemaphoreSlim` compartilhado pelo singleton `FiscalUsageGuard`. Assim, chamadas diretas à SEFAZ são serializadas no Bridge daquele PC mesmo quando duas abas tentam consultar ao mesmo tempo.

O gate envolve a pré-checagem de proteção, o registro da tentativa e a chamada ao transporte fiscal. O `CancellationToken` continua sendo respeitado.

## Estado persistido

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

Não são persistidos:

- CNPJ em texto puro;
- chave de acesso NF-e;
- XML;
- PFX;
- senha;
- chave privada;
- conteúdo de exceções fiscais.

A escrita usa arquivo temporário, `FileOptions.WriteThrough`, flush explícito até o disco e substituição do estado somente depois da gravação concluída.

Se o JSON existente estiver corrompido ou ilegível, o guard **não falha aberto**. Ele entra em proteção conservadora por uma janela de uma hora (`state_recovery`), tenta regravar um estado mínimo recuperável e faz a consulta seguir pelo Portal em vez de arriscar uma nova tentativa fiscal que poderia prolongar um bloqueio `656`.

## Janela e limite local

A janela operacional é de uma hora. O guard mantém no máximo o histórico necessário para a janela e aplica limite local de 20 tentativas diretas por identidade fiscal.

Antes de uma chamada fiscal:

1. lê a identidade fiscal do A1 selecionado;
2. adquire o gate;
3. remove timestamps/bloqueios expirados;
4. verifica uma eventual proteção global de recuperação;
5. verifica `blockedUntilUtc` da identidade;
6. verifica o número de tentativas recentes;
7. se permitido, registra a tentativa;
8. somente então chama `INfeDistributionTransport`.

Se a proteção já estiver ativa, `NfeLookupService` retorna `consumption_limit` sem tocar na SEFAZ.

## Eventos que ativam proteção

- HTTP 429 do transporte;
- `cStat 656` da SEFAZ;
- atingimento do limite local de tentativas na janela;
- estado persistido local corrompido/ilegível (`state_recovery`).

Para 429/656 o prazo salvo é de uma hora a partir do evento observado. O limite local usa a expiração da tentativa mais antiga da janela. A recuperação de estado também usa uma hora por segurança.

## Integração com consulta única

A consulta única continua chamando o mesmo endpoint `/api/v1/nfe/lookup`. Se o guard devolver proteção local, o frontend recebe `consumption_limit` e usa o fallback Portal já existente, sem tentativa fiscal adicional.

## Integração com consulta em lote

O lote continua usando o endpoint unitário e não possui teto rígido de quantidade na interface. Ao receber `consumption_limit`:

- a NF-e atual passa ao Portal;
- a rota do restante do lote muda para Portal;
- nenhuma chave restante tenta a SEFAZ naquele lote;
- hCaptcha continua manual para cada operação Portal.

O teto local de 20 tentativas diretas por hora é uma proteção da rota SEFAZ, não um limite de tamanho do lote. Um lote pode conter mais itens; depois que a proteção fiscal entra em ação, os itens restantes seguem sequencialmente pelo Portal.

## Limitação multi-PC

O arquivo é local. Se dois PCs usam certificados do mesmo CNPJ, cada um conhece somente as próprias tentativas. Essa limitação continua existindo e é o principal ponto de proteção fiscal ainda não resolvido estruturalmente.

O Portal não é tratado como serviço oficialmente ilimitado. A aplicação apenas deixa de impor um limite artificial de quantidade; o fluxo continua sequencial, sujeito ao hCaptcha manual e ao comportamento do Portal Nacional.

`distNSU` continua fora desta arquitetura. Caso o volume futuro exija coordenação real por CNPJ, isso deve ser projetado separadamente sem mover certificado/chave privada para um coordenador remoto e sem reintroduzir o antigo PC central.

## Testes

Cobertura relevante:

- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/FiscalUsageGuardTests.cs` — limite, persistência, reinício, expiração e recuperação conservadora de estado corrompido;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupUsageGuardTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeLookupServiceTests.cs`.

A aceitação física da consulta em lote está em `docs/testing/batch-query.md`.
