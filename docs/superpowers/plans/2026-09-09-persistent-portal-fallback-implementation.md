# Portal Persistente e Fallback Otimizado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir a latência do fallback Portal mantendo consulta direta SEFAZ como caminho padrão e Portal somente após `consumption_limit`.

**Architecture:** Aplicar primeiro ganhos seguros de latência no frontend/launcher; depois substituir o helper descartável por um helper persistente WebView2 controlado pelo Bridge via Named Pipes locais, com uma operação por vez e fail-closed. O contrato público do site com o Bridge permanece `POST /api/v1/portal/start` + `GET /api/v1/portal/status/{operationId}`.

**Tech Stack:** TypeScript/Vite/Vitest, .NET 10, WinForms, WebView2, System.IO.Pipes, xUnit, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-09-persistent-portal-fallback-design.md`

## Global Constraints

- Consulta direta via SEFAZ é sempre tentada primeiro.
- Portal só pode abrir quando `category === 'consumption_limit'`.
- hCaptcha permanece manual.
- Apenas uma operação Portal ativa por PC.
- IPC restrito ao usuário atual; sem nova porta TCP.
- XML máximo: 10 MiB. Mensagem IPC máxima: 11 MiB.
- Readiness do helper: 5 s.
- Cooldown após falha fatal do WebView2: 10 s.
- Polling web ativo: 250 ms, sem chamadas paralelas.
- Sem retry fiscal automático.
- Preservar validações de host oficial, certificado, download e XML existentes.

---

### Task 1: Ganhos seguros de latência no frontend

**Files:**
- Modify: `apps/web/src/portal/fallback.ts`
- Modify: `apps/web/tests/portal-fallback.test.ts`
- Verify: `apps/web/tests/portal-integration.test.ts`

**Interfaces:**
- Consumes: `PortalFallbackController.waitForResult(operationId, signal)`
- Produces: mesmo contrato público, com `DEFAULT_POLL_MS = 250`.

- [ ] **Step 1: RED — exigir polling padrão de 250 ms sem chamadas paralelas**

Adicionar teste que injeta `sleep` capturando o valor recebido e retorna um estado `waiting_for_user` seguido de `completed`; afirmar que o sleep recebe exatamente `250` uma única vez.

- [ ] **Step 2: Rodar RED**

Run: `npm run test:web -- --run apps/web/tests/portal-fallback.test.ts`
Expected: FAIL porque o default atual é 800 ms.

- [ ] **Step 3: GREEN — alterar apenas o intervalo padrão**

Em `apps/web/src/portal/fallback.ts`, mudar:

```ts
const DEFAULT_POLL_MS = 250;
```

Sem adicionar polling concorrente, deadline global ou retry extra.

- [ ] **Step 4: Rodar GREEN da suíte web focal**

Run: `npm run test:web -- --run apps/web/tests/portal-fallback.test.ts apps/web/tests/portal-integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `perf: reduzir latência do polling do Portal`.

---

### Task 2: Cachear probe positivo do WebView2 durante a vida do Bridge

**Files:**
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Portal/ProcessPortalWindowLauncher.cs`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/ProcessPortalWindowLauncherTests.cs`

**Interfaces:**
- Consumes: `ProcessPortalWindowLauncher.IsAvailable`
- Produces: mesmo contrato, mas o runtime probe positivo é executado no máximo uma vez por instância do launcher.

- [ ] **Step 1: RED — provar que probe positivo é reutilizado**

Adicionar teste com contador no `runtimeProbe`, helper temporário existente e duas leituras de `IsAvailable`; em Windows, afirmar contador `1`.

- [ ] **Step 2: Rodar RED**

Run: `dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release`
Expected: FAIL porque o probe atual roda em cada leitura.

- [ ] **Step 3: GREEN — cache somente do resultado positivo**

Adicionar campo privado thread-safe para memorizar disponibilidade positiva do runtime; resultado negativo continua reavaliável para permitir instalação posterior do Runtime sem reiniciar o Bridge.

- [ ] **Step 4: Rodar GREEN bridge tests**

Run: `dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `perf: cachear probe positivo do WebView2`.

---

### Task 3: Definir protocolo IPC local com framing limitado

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PortalIpcContracts.cs`
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PortalIpcProtocol.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PortalIpcProtocolTests.cs`

**Interfaces:**
- Produces:
  - `PortalIpcMessageType` com `Ready`, `StartOperation`, `WaitingForUser`, `Completed`, `Cancelled`, `Failed`, `Shutdown`, `Heartbeat`.
  - `PortalIpcEnvelope(string Type, string? OperationId, string? AccessKey, string? CertificateThumbprint, string? Xml, string? Message)`.
  - `PortalIpcProtocol.WriteAsync(Stream, PortalIpcEnvelope, CancellationToken)`.
  - `PortalIpcProtocol.ReadAsync(Stream, CancellationToken)`.

- [ ] **Step 1: RED — roundtrip e limites**

Testar roundtrip JSON UTF-8 com prefixo de comprimento de 4 bytes little-endian; testar rejeição de tamanho <= 0 e > 11 MiB; testar EOF parcial.

- [ ] **Step 2: Rodar RED**

Run: bridge test project.
Expected: FAIL porque tipos ainda não existem.

- [ ] **Step 3: GREEN — implementar protocolo mínimo**

Usar `System.Text.Json`; ler exatamente 4 bytes do prefixo e depois exatamente o payload; falhar com `InvalidDataException` em framing inválido; nunca logar payload fiscal.

- [ ] **Step 4: Rodar GREEN**

Run: bridge test project.
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: adicionar protocolo IPC do Portal`.

---

### Task 4: Cliente persistente do Portal no Bridge

**Files:**
- Create: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PersistentPortalClient.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Portal/ProcessPortalWindowLauncher.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PersistentPortalClientTests.cs`

**Interfaces:**
- Produces:
  - `PersistentPortalClient.OpenAsync(PortalLaunchRequest, CancellationToken) : Task<PortalLaunchResult>`.
  - `PersistentPortalClient.IsAvailable`.
- `ProcessPortalWindowLauncher` passa a delegar para o cliente persistente; `IPortalWindowLauncher` permanece inalterada para não propagar arquitetura IPC ao restante do Bridge.

- [ ] **Step 1: RED — segunda operação reutiliza o mesmo helper**

Criar seam de processo/conexão testável. Testar duas operações sequenciais e afirmar uma única inicialização de helper.

- [ ] **Step 2: RED — Busy rejeita segunda operação simultânea**

Manter primeira operação aberta; iniciar segunda e esperar resultado determinístico `Failed` com mensagem de operação Portal já em andamento.

- [ ] **Step 3: RED — queda do helper falha operação atual e próxima pode reiniciar**

Simular EOF/desconexão durante operação; afirmar `Failed`, limpar estado, depois nova operação cria nova conexão/helper.

- [ ] **Step 4: GREEN — implementar state machine mínima**

Estados internos: `Stopped`, `Starting`, `Idle`, `Busy`, `Recovering`, `Faulted`. Usar `SemaphoreSlim(1,1)` apenas para proteger transições; não enfileirar segunda operação durante `Busy`.

Startup:
- iniciar `NfeAgendamento.Portal.exe --server --pipe-name <nome>` quando não conectado;
- aguardar `Ready` no máximo 5 s;
- após falha fatal, respeitar cooldown de 10 s antes de nova inicialização automática.

- [ ] **Step 5: GREEN — integrar ao launcher sem mudar `IPortalWindowLauncher`**

`ProcessPortalWindowLauncher.OpenAsync` deve usar o cliente persistente; manter `--probe-runtime` apenas como compatibilidade/diagnóstico durante migração.

- [ ] **Step 6: Rodar GREEN bridge tests**

Run: bridge test project.
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: reutilizar helper Portal persistente no Bridge`.

---

### Task 5: Servidor Named Pipe no helper Portal

**Files:**
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/Program.cs`
- Create: `apps/bridge/windows/NfeAgendamento.Portal/PortalServer.cs`
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/PortalWindow.cs`
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PortalServerContractTests.cs` ou testes unitários equivalentes em projeto apropriado.

**Interfaces:**
- Consumes: `--server --pipe-name <nome>`.
- Produces: servidor Named Pipe restrito ao usuário atual; responde `Ready`; aceita exatamente uma `StartOperation` por vez.

- [ ] **Step 1: RED — modo server não abre janela ao iniciar**

Extrair lógica de parsing/boot testável e afirmar que `--server` cria host sem `Application.Run(new PortalWindow(...))` imediato.

- [ ] **Step 2: RED — sequência Ready -> Start -> terminal**

Testar servidor com stream/transport seam sem WebView2 real: ao iniciar envia `Ready`; ao receber `StartOperation`, encaminha request ao controlador; terminal volta pelo protocolo.

- [ ] **Step 3: GREEN — implementar `PortalServer`**

Criar `NamedPipeServerStream` para usuário atual, uma conexão Bridge por vez, framing por `PortalIpcProtocol`. Em desconexão, cancelar operação atual e voltar a aguardar conexão enquanto processo estiver saudável.

- [ ] **Step 4: GREEN — `Program.cs` suporta `--server`**

Fluxos preservados:
- `--probe-runtime` continua existente;
- modo legado descartável permanece temporariamente como fallback de compatibilidade durante a migração;
- `--server` é o caminho usado pelo novo launcher.

- [ ] **Step 5: Rodar testes**

Run: bridge test project + build do helper.
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: adicionar servidor persistente ao helper Portal`.

---

### Task 6: Reutilizar um único WebView2 entre operações

**Files:**
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/PortalWindow.cs`
- Create: `apps/bridge/windows/NfeAgendamento.Portal/PortalOperationController.cs`
- Add tests for operation lifecycle with UI-independent seams.

**Interfaces:**
- Produces:
  - `PrepareAsync()` inicializa WebView2 uma única vez.
  - `RunAsync(PortalLaunchRequest, CancellationToken)` mostra janela, prepara chave, aguarda terminal, oculta janela.
  - `CancelCurrentOperation()`.

- [ ] **Step 1: RED — WebView2 init executa uma vez por processo**

Extrair factory seam e testar duas operações sequenciais com contador de inicialização = 1.

- [ ] **Step 2: RED — fechar janela cancela operação sem matar servidor**

Simular close durante operação e afirmar retorno `Cancelled`; estado volta a `Idle` e segunda operação pode iniciar.

- [ ] **Step 3: GREEN — separar ciclo de vida da janela do ciclo de vida do processo**

Não fechar/dispor o Form no terminal normal; usar `Hide()` após completed/cancelled/failed. `FormClosing` durante operação deve cancelar e esconder; encerramento real somente em shutdown/session end/falha fatal.

- [ ] **Step 4: GREEN — preparar chave de forma idempotente**

Após navegação oficial concluída, preencher a chave atual, disparar `input/change` e focar input; limpar estado de operação anterior antes de nova chave.

- [ ] **Step 5: GREEN — preservar proteções existentes**

Manter bloqueio de host externo, popup, client certificate fora do host oficial, download não oficial, DevTools/context menu e validação de XML.

- [ ] **Step 6: Rodar testes/build helper**

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: reutilizar WebView2 entre consultas Portal`.

---

### Task 7: Retorno direto do XML via IPC

**Files:**
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/PortalWindow.cs`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/Portal/PersistentPortalClient.cs`
- Modify: tests IPC/Portal.

**Interfaces:**
- `Completed` transporta XML validado diretamente no envelope IPC.
- Arquivo temporário permanece somente como destino controlado do `DownloadStarting` do WebView2.

- [ ] **Step 1: RED — completed não depende de resultPath intermediário**

Testar que uma resposta IPC `Completed` com XML válido produz `PortalLaunchResult.Completed(xml)` sem leitura de arquivo de retorno Bridge-side.

- [ ] **Step 2: GREEN — remover result/error files do caminho persistente**

No modo `--server`, eliminar `--result` e `--error`; manter esses argumentos apenas no modo legado até remoção futura.

- [ ] **Step 3: GREEN — validação em profundidade**

Helper valida XML baixado; Bridge volta a validar com `NfePortalXmlValidator.Validate(xml, accessKey)` no `PortalFallbackService`.

- [ ] **Step 4: Rodar testes**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `perf: retornar XML do Portal diretamente por IPC`.

---

### Task 8: Watchdog e encerramento limpo

**Files:**
- Modify: `PersistentPortalClient.cs`
- Modify: `PortalServer.cs`
- Modify: app shutdown wiring se necessário em `Program.cs`.
- Add tests.

**Interfaces:**
- Helper encerra após comando `Shutdown`, session end, ou ausência do Bridge por 5 s após perda da conexão.

- [ ] **Step 1: RED — helper órfão termina após grace period**

Testar relógio/seam de watchdog sem esperar 5 s reais; simular perda do Bridge e avanço de tempo.

- [ ] **Step 2: RED — shutdown não cancela processo saudável de forma abrupta**

Testar envio de `Shutdown`, encerramento cooperativo e liberação de pipe/window.

- [ ] **Step 3: GREEN — watchdog mínimo**

Sem serviço Windows, sem daemon global. O helper pertence à sessão do usuário e encerra de forma cooperativa.

- [ ] **Step 4: Rodar testes**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix: encerrar helper Portal órfão com segurança`.

---

### Task 9: Integração end-to-end do fallback e regressões

**Files:**
- Modify: `apps/web/tests/portal-integration.test.ts`
- Modify/add Bridge tests de integração do fallback.

**Interfaces:**
- Nenhuma mudança no contrato público do site.

- [ ] **Step 1: Testar categorias que nunca podem abrir Portal**

Cobrir `success`, `certificate_error`, `transport_unavailable`, `fiscal_status` e erro genérico.

- [ ] **Step 2: Testar `consumption_limit` como único gatilho**

Garantir chamada de `portalFallback.start(...)` somente nesse ramo.

- [ ] **Step 3: Testar duas operações sequenciais**

Primeira inicializa helper; segunda reutiliza o mesmo processo/conexão.

- [ ] **Step 4: Testar recuperação após crash**

Operação corrente falha; próxima reinicializa helper; nenhuma repetição automática da operação perdida.

- [ ] **Step 5: Rodar suítes completas focalizadas**

Run:
- `npm run test:web`
- bridge test project
- `dotnet build apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release`
- `dotnet build apps/bridge/windows/NfeAgendamento.App/NfeAgendamento.App.csproj -c Release`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `test: validar fallback Portal persistente fim a fim`.

---

### Task 10: Documentação, pacote e verificação final

**Files:**
- Modify: `README.md`
- Modify: acceptance/current-context docs already used by repository
- Create/update release notes only if a new installer version is published as part of this task.

- [ ] **Step 1: Atualizar documentação operacional**

Documentar:
- direta primeiro;
- Portal somente no limite;
- helper persistente oculto;
- hCaptcha manual;
- uma operação Portal por vez;
- recuperação após crash;
- expectativa de primeira vs segunda abertura.

- [ ] **Step 2: Revisar diff desde a spec**

Garantir que não houve alteração não solicitada em parser XML, DANFE, Fernando Klein ou consulta fiscal direta além do gating já existente.

- [ ] **Step 3: CI completo**

Aguardar GitHub Actions:
- web tests/build/wrangler dry-run;
- bridge tests/build;
- Windows package.

Expected: todos `success`.

- [ ] **Step 4: Teste físico Windows**

No PC do usuário:
1. Reiniciar Bridge/App.
2. Consulta direta abaixo do limite: Portal não abre.
3. Forçar/usar cenário `consumption_limit`: primeira abertura funciona.
4. Concluir hCaptcha/download.
5. Nova operação Portal na mesma sessão: abertura perceptivelmente mais rápida.
6. Fechar janela durante operação: retorna cancelled e próxima operação continua funcionando.

- [ ] **Step 5: Só então marcar implementação como pronta**

Critério: testes automatizados verdes + pacote verde + validação física do comportamento Windows.