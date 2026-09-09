# Plano de implementação — estabilização e hardening

**Spec:** `docs/superpowers/specs/2026-09-09-stabilization-hardening-design.md`

**Objetivo:** transformar os achados recorrentes de revisão em contratos automatizados e fechar lifecycle, IPC, supply chain, build e release sem adicionar funcionalidades de produto.

**Estratégia:** TDD por bloco. Para cada comportamento novo: teste vermelho comprovado, implementação mínima, CI verde. A rodada só termina após revisão adversarial do diff completo, documentação atualizada e CI final completo incluindo instalador Windows.

## Status de execução — 09/09/2026

- ✅ Task 1 — release vinculada ao SHA validado.
- ✅ Task 2 — contrato de controle/lease do Bridge.
- ✅ Task 3 — servidor de controle no Bridge gerenciado.
- ✅ Task 4 — adoção, monitoramento, shutdown e restart controlado pelo App.
- ✅ Task 5 — cancelamento/reconexão/cooldown do Portal.
- ✅ Task 6 — cancelamento web confiável no unload.
- ✅ Task 7 — lockfile, audit, Actions atuais e validação Windows.
- ✅ Task 8 — `xUnit1051` e `MSB3277` eliminados e promovidos a gates.
- ✅ Task 9 — README, arquitetura, checklist físico e status da spec atualizados.
- ⏳ Task 10 — revisão adversarial do diff + CI final do HEAD.

Hardening externo que permanece fora do código: **Authenticode** (certificado/segredo de assinatura) e **branch protection/required status checks** (configuração administrativa do GitHub). A versão canônica permanece `0.0.6`; nenhuma release nova será criada nesta rodada sem solicitação explícita.

## Task 1 — Endurecer release no SHA validado

**Arquivos:**
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs`
- Modify: `.github/workflows/release.yml`

**RED:** exigir `--target` com `github.event.workflow_run.head_sha` e validação de tag já existente contra o mesmo SHA.

**GREEN:** resolver `validated_sha`, validar tag existente via GitHub e criar release explicitamente com `--target "$validated_sha"`.

## Task 2 — Criar contrato de controle e lease do Bridge

**Arquivos:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Runtime/BridgeControlContracts.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Runtime/BridgeControlState.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Runtime/BridgeControlProtocol.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/BridgeControlStateTests.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/BridgeControlProtocolTests.cs`

**RED:** testar identidade, claim único, heartbeat, shutdown autorizado, timeout inicial e lease expirado.

**GREEN:** estado puro e protocolo JSON limitado/versionado, sem dependência de WinForms.

## Task 3 — Servidor de controle no Bridge gerenciado

**Arquivos:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Runtime/BridgeControlServer.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Program.cs`
- Create/Modify tests em `apps/bridge/tests/NfeAgendamento.Bridge.Tests/`

**RED:** contrato estático/integrável exige `--managed`, `PipeOptions.CurrentUserOnly`, shutdown via `IHostApplicationLifetime` e watchdog de lease.

**GREEN:** iniciar control server apenas no executável real em modo gerenciado; standalone continua disponível para desenvolvimento/testes.

## Task 4 — App adota, monitora e encerra Bridge corretamente

**Arquivos:**
- Create: `apps/bridge/windows/NfeAgendamento.App/BridgeControlClient.cs`
- Create: `apps/bridge/windows/NfeAgendamento.App/BridgeRestartPolicy.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.App/Program.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.App/NfeAgendamento.App.csproj`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj`
- Modify/Create tests de lifecycle

**RED:** cobrir adoção, identidade/path, shutdown de Bridge adotado, ausência de kill por nome, backoff 1/2/5 s e circuit breaker.

**GREEN:** App inicia Bridge com `--managed`, valida identidade, reivindica lease, envia heartbeat, reinicia com backoff controlado e usa shutdown gracioso; kill somente como último recurso para PID/path previamente validados.

## Task 5 — Completar cancelamento e recuperação do Portal

**Arquivos:**
- Modify: `PortalIpcContracts.cs`
- Modify: `PortalServerSessionLoop.cs`
- Modify: `PersistentPortalClient.cs`
- Modify: `PortalProcessSessionFactory.cs`
- Modify: `ProcessPortalWindowLauncher.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/PortalServer.cs`
- Modify tests de Portal

**RED:** exigir `cancel_operation`, cancelamento observado pelo runner, reconexão ao helper saudável e cooldown determinístico após falha fatal.

**GREEN:** sessão duplex suporta cancelamento; servidor aceita reconexões; factory mantém ownership do helper; cliente aplica cooldown curto com relógio injetável.

## Task 6 — Cancelamento web confiável no unload

**Arquivos:**
- Modify: `apps/web/tests/bridge-client.test.ts`
- Modify: `apps/web/src/bridge/client.ts`

**RED:** exigir `keepalive: true` no POST de cancelamento.

**GREEN:** cancelamento usa request pequeno com keepalive sem reutilizar signal abortado.

## Task 7 — Supply chain e CI sem alertas relevantes

**Arquivos:**
- Modify: `apps/web/tests/deploy-config.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`, `apps/web/package.json`, `package-lock.json` conforme advisories
- Create/Modify: `global.json` e lockfiles NuGet se necessários

**RED:** CI deve conter gate `npm audit --audit-level=high` e jobs corretos por plataforma.

**Diagnóstico:** executar gate para capturar advisories reais.

**GREEN:** dependência transitiva vulnerável corrigida via lockfile/override revisado, `npm audit` sem high/critical, `npm ci` mantido e desktop validado no runner Windows.

## Task 8 — Eliminar warnings .NET e tornar testes canceláveis

**Arquivos:**
- Modify: testes apontados por xUnit1051
- Modify: CI/projetos somente quando tecnicamente necessário

**GREEN final:** testes async usam `TestContext.Current.CancellationToken`; `xUnit1051` é erro; Portal remove somente a referência WebView2 WPF não usada, preserva Core/WinForms e trata `MSB3277` como erro. Publish Windows e Setup passaram.

## Task 9 — Documentação e checklist físico

**Arquivos:**
- Modify: `README.md`
- Modify: `docs/architecture/bridge-security.md`
- Modify: `docs/testing/acceptance.md`
- Modify: spec/plano status

**GREEN:** documentação descreve control pipe/lease, restart policy, Portal reconnect/cooldown/cancelamento, audit gate, `Sair`, validação física e hardenings externos sem alegar implementação inexistente.

## Task 10 — Revisão adversarial e verificação final

1. Comparar base `d87c46a...` até HEAD e revisar superfícies de falha.
2. Conferir que todos os achados P1/P2 da revisão foram convertidos em código + teste.
3. Executar CI final sem novos pushes até terminar.
4. Exigir sucesso de `web`, `bridge` e `windows-package`.
5. Inspecionar logs por `warning`, `high severity`, `MSB3277`, `xUnit1051`, falhas/skips inesperados.
6. Confirmar artifacts do instalador/pacote.
7. Não criar release nem alterar `0.0.6` sem solicitação explícita.

## Critério final

Código/CI só será declarado estabilizado quando todos os contratos automatizados estiverem verdes no HEAD final, a documentação representar o código e não houver vulnerabilidade high/critical ou warning técnico relevante conhecido sendo ignorado. O teste físico Windows continua separado e obrigatório antes de declarar uma build validada em produção.
