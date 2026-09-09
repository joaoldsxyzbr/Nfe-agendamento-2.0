# NFe Agendamento 2.0

Reescrita limpa do NFe Agendamento com **site estático + App/Bridge Windows local**.

## Arquitetura atual

- **Site:** Vite + TypeScript; concentra interface, parsing XML, DANFE e regras de apresentação.
- **App Windows:** `NfeAgendamento.App.exe` em WinForms; inicia oculto, permanece na bandeja, gerencia o lifecycle do Bridge e oferece atualização manual confirmada pelo usuário.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345` somente.
- **Controle App → Bridge:** Named Pipe local separado da API web, restrito ao usuário atual, com identidade, lease, heartbeat e shutdown controlado.
- **API local:** `/api/v1`.
- **Segurança:** Host estrito `127.0.0.1:17345`, CORS sem wildcard, origem oficial fixa em `https://nfeagendamento.joaolds.xyz.br` e headers web restritivos via `_headers`.
- **Certificado A1:** descoberto em `CurrentUser/My`; a chave privada nunca sai do Windows/Bridge.
- **Persistência:** somente o thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`.
- **Fallback Portal:** helper Windows separado com WebView2, Portal Nacional fixo, hCaptcha sempre manual e processo persistente reutilizado entre consultas do mesmo Bridge.
- **Distribuição Windows:** instalador Inno Setup por usuário, sem administrador, com início automático do app na bandeja no login.
- **Versionamento:** versão canônica em `Directory.Build.props`; Bridge, App, Portal, instalador e release derivam dessa única fonte.

## Estado funcional — 09/09/2026

Implementado e coberto pelos testes automatizados do projeto:

- bootstrap Vite/TypeScript e .NET 10;
- dependências npm fixadas por `package-lock.json`, CI usando `npm ci` e gate `npm audit --audit-level=high`;
- projetos .NET com `PackageReference` usam `packages.lock.json`, `RestorePackagesWithLockFile=true` e `RestoreLockedMode=true`, impedindo restore silencioso com grafo NuGet divergente;
- zero vulnerabilidades `high`/`critical` no lockfile npm atualmente validado pelo CI;
- `sharp` transitivo fixado em `0.35.4` para eliminar o advisory conhecido do toolchain Cloudflare;
- tema visual dark e DANFE branco/fiscal;
- certificado A1 no painel de configurações;
- `GET /api/v1/health` e detecção do Bridge pelo site;
- proteção de `Origin`/`Host` com testes de integração;
- origem oficial `https://nfeagendamento.joaolds.xyz.br` embutida na configuração de produção do Bridge, sem wildcard e sem prompt no Setup;
- CSP com `default-src 'self'`, `connect-src` limitado ao próprio site + `127.0.0.1:17345`, `object-src 'none'`, `frame-ancestors 'none'`, além de `nosniff`, `Referrer-Policy: no-referrer` e `Permissions-Policy` restritiva;
- `GET /api/v1/certificates` e `POST /api/v1/certificate/select`;
- filtro A1 por chave privada, validade e Client Authentication quando EKU estiver presente;
- `POST /api/v1/nfe/lookup` com validação completa da chave de 44 dígitos;
- transporte para `NFeDistribuicaoDFe` autenticado pelo certificado A1 selecionado;
- parsing defensivo da resposta SEFAZ, DTD desabilitado e limite de 10 MiB;
- categorias normalizadas `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable` e `technical_error`;
- tratamento de `137`, `138`, `656`, HTTP 429, timeout e falhas ambíguas sem retry automático;
- timeouts separados no cliente web: `health` 2 s, operações locais 5 s, lookup fiscal 50 s e chamadas do Portal 8 s;
- pipeline XML no site com validação contra a chave consultada;
- modelo fiscal tipado e DANFE A4 compacto;
- tratamento Fernando Klein preservando o `cProd` fiscal;
- preview DANFE em modal, `Ctrl + scroll`, impressão/PDF e download XML;
- fallback automático `consumption_limit/656 → Portal Nacional → XML → mesmo parser/DANFE`;
- Portal não anunciado na ajuda normal; o fallback só aparece após limite de consumo da SEFAZ;
- helper `NfeAgendamento.Portal.exe` em WinForms/WebView2 com hCaptcha sempre manual;
- helper Portal persistente e reconectável por Named Pipe local, uma operação por vez;
- cancelamento Portal end-to-end, inclusive comando IPC `cancel_operation` até o runner/WebView2;
- cancelamento web best-effort em `pagehide/reload` com `fetch(..., { keepalive: true })`;
- estados terminais do Portal (`completed`, `failed`, `cancelled`) retidos por 2 minutos e depois removidos com XML/CTS associados;
- falha fatal da sessão Portal invalida a sessão e aplica cooldown curto antes de recriar o helper, evitando restart-loop;
- probe headless do WebView2 Runtime, com resultado positivo cacheado, sem abrir janela durante `/health`;
- instância única no executável real do Bridge para impedir listeners concorrentes;
- App inicia o Bridge instalado com `--managed`;
- control pipe `NfeAgendamento.Bridge.Control.v1` usa `PipeOptions.CurrentUserOnly`;
- o App valida PID, versão, caminho do executável, `instanceId` e modo gerenciado antes de assumir um Bridge existente;
- lease único com heartbeat periódico; Bridge gerenciado órfão encerra sozinho quando o lease expira;
- o App tenta adotar uma instância gerenciada válida existente antes de iniciar outra;
- o tray não mata processos arbitrários por nome;
- queda inesperada do Bridge usa reinício com backoff `1 s → 2 s → 5 s` e circuit breaker em vez de crash-loop infinito;
- status da bandeja acompanha o estado real: ativo, reconectando ou indisponível;
- **Sair** envia `Shutdown` pelo control pipe e aguarda encerramento gracioso; término forçado só pode ser usado como último recurso sobre PID/caminho previamente validados;
- `NfeAgendamento.App.exe` é `WinExe`, sem janela de console, com `NotifyIcon` na bandeja;
- duplo clique na bandeja abre o site oficial e o menu oferece **Abrir NFe Agendamento**, **Verificar atualizações** e **Sair**;
- atualizador manual consulta somente a release estável mais recente do repositório oficial, exige confirmação e valida asset, tamanho e SHA-256 antes de iniciar o Setup;
- deploy Cloudflare pela raiz usando `wrangler.jsonc` e `npx wrangler deploy --dry-run` no CI;
- versão canônica atual `0.0.6` em `Directory.Build.props`;
- instalador Inno Setup por usuário em `%LOCALAPPDATA%\NFe Agendamento Bridge`, sem UAC/admin;
- auto-start em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` apontando para `NfeAgendamento.App.exe`;
- App, Bridge e Portal publicados como **self-contained win-x64**;
- `windows-package` publica Bridge/Portal/App no Windows e gera Setup + pacote técnico;
- `xUnit1051` é tratado como erro na suíte .NET;
- `MSB3277` é tratado como erro no Portal; a referência WPF não utilizada do pacote WebView2 é removida antes de `ResolveAssemblyReferences`, mantendo apenas Core + WinForms;
- `release.yml` é genérico e só publica artifacts do mesmo CI verde quando o commit marcador segue `release: v<versão>` e aponta a tag explicitamente para o SHA validado.

## Pendências antes de declarar uso real validado

A automação cobre código, testes e empacotamento, mas ainda é necessário executar o **teste físico Windows** em `docs/testing/acceptance.md` no commit/Setup que será efetivamente usado. Isso inclui instalação/desinstalação, bandeja, lifecycle do Bridge, navegador real, A1 real, consulta SEFAZ, DANFE/PDF, fallback Portal/WebView2/hCaptcha e segundo PC independente.

Dois hardenings permanecem externos ao código desta rodada:

- **Authenticode:** os executáveis/Setup não são assinados enquanto não houver certificado de code signing e segredo de assinatura disponíveis ao pipeline;
- **proteção da `main`:** branch protection/ruleset e status checks obrigatórios dependem de configuração administrativa do repositório GitHub.

Essas pendências não reduzem os gates já existentes no CI, mas impedem afirmar identidade criptográfica do publisher ou política administrativa da branch enquanto não forem configuradas.

## Fora de escopo

Não existem Central, pareamento, líder/standby, servidor LAN, pasta compartilhada, login, banco, histórico, consulta em lote ou **atualização silenciosa/automática** do Bridge. A atualização existente é iniciada e confirmada manualmente pelo usuário no app da bandeja.

## Desenvolvimento

```bash
npm ci
npm audit --audit-level=high
npm run test:web
npm run build:web

dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.App/NfeAgendamento.App.csproj -c Release
```

Os projetos .NET com dependências NuGet externas restauram em **locked mode**; se um `PackageReference` mudar, regenere e revise o `packages.lock.json` correspondente no mesmo commit.

## Deploy Cloudflare

O Cloudflare Workers Builds pode usar o comando padrão na raiz:

```bash
npx wrangler deploy
```

O `wrangler.jsonc` executa `npm run build:web` e publica `./apps/web/dist`. O CI também executa `npx wrangler deploy --dry-run`.

## Distribuição Windows

A versão canônica continua `0.0.6` e **não foi criada uma nova release nesta rodada de estabilização**. Para qualquer teste pós-`v0.0.6`, use o Setup/artifact produzido pelo **mesmo commit CI** que está sendo validado; não confunda um artifact de Actions pós-release com o binário da release pública `v0.0.6`.

O instalador:

- instala somente para o usuário atual em `%LOCALAPPDATA%\NFe Agendamento Bridge`;
- não solicita administrador;
- mantém App + Bridge + helper Portal lado a lado;
- inclui o runtime .NET necessário no publish self-contained;
- cria atalho **NFe Agendamento** no Menu Iniciar;
- registra início automático do App no login do usuário;
- inicia o App ao finalizar quando a opção estiver marcada;
- não pede URL nem origem;
- remove auto-start e arquivos instalados na desinstalação;
- preserva `%LOCALAPPDATA%\NfeAgendamentoBridge`, onde fica a seleção local do certificado;
- não instala atualizações silenciosamente.

O site de produção autorizado é exatamente:

```text
https://nfeagendamento.joaolds.xyz.br
```

O **Microsoft Edge WebView2 Runtime** continua necessário somente para o fallback pelo Portal Nacional.

## Fluxo de release

1. Atualize a versão apenas em `Directory.Build.props`.
2. Adicione/atualize `docs/releases/v<versão>.md`.
3. Faça o commit final com mensagem `release: v<versão>`.
4. O CI testa, compila e empacota os artifacts Windows.
5. O workflow `.github/workflows/release.yml` publica somente os artifacts daquele `workflow_run` verde e cria/valida a tag no SHA exato que o CI aprovou.

## Documentação

- arquitetura/segurança: `docs/architecture/bridge-security.md`;
- aceitação física: `docs/testing/acceptance.md`;
- atualizador manual: `docs/testing/bridge-updater.md`;
- design de estabilização: `docs/superpowers/specs/2026-09-09-stabilization-hardening-design.md`;
- plano/status da estabilização: `docs/superpowers/plans/2026-09-09-stabilization-hardening-implementation.md`;
- layout DANFE: `docs/testing/danfe-layout.md`;
- notas da release pública atual: `docs/releases/v0.0.6.md`.
