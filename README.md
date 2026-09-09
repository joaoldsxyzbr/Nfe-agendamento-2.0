# NFe Agendamento 2.0

Reescrita limpa do NFe Agendamento com **site estático + Bridge Windows mínimo**.

## Arquitetura atual

- **Site:** Vite + TypeScript; concentra interface, parsing XML, DANFE e regras de apresentação.
- **App Windows:** `NfeAgendamento.App.exe` em WinForms; inicia oculto, permanece na bandeja, gerencia o Bridge local e oferece atualização manual confirmada pelo usuário.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345` somente.
- **API local:** `/api/v1`.
- **Segurança:** Host estrito `127.0.0.1:17345`, CORS sem wildcard e origem oficial de produção fixa em `https://nfeagendamento.joaolds.xyz.br`.
- **Certificado A1:** descoberto em `CurrentUser/My`; a chave privada nunca sai do Windows/Bridge.
- **Persistência:** somente o thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`.
- **Fallback Portal:** helper Windows separado com WebView2, Portal Nacional fixo, hCaptcha sempre manual e processo persistente reutilizado entre consultas do mesmo Bridge.
- **Distribuição Windows:** instalador Inno Setup por usuário, sem administrador, com início automático do app na bandeja no login.

## Estado funcional — 09/09/2026

Implementado e coberto pelos testes automatizados do projeto:

- bootstrap Vite/TypeScript e .NET 10;
- build e testes web + Bridge;
- tema visual dark inspirado no site legado, com superfícies azul-escuras, azul como ação principal, amarelo como destaque e DANFE preservado branco/fiscal;
- certificado A1 movido para painel de configurações aberto pela engrenagem no canto superior direito;
- `GET /api/v1/health` e detecção do Bridge pelo site;
- proteção de `Origin`/`Host` com testes de integração;
- origem oficial `https://nfeagendamento.joaolds.xyz.br` embutida na configuração de produção do Bridge, sem wildcard e sem prompt no Setup;
- `GET /api/v1/certificates` e `POST /api/v1/certificate/select`;
- filtro A1 por chave privada, validade e Client Authentication quando EKU estiver presente;
- seleção do certificado diretamente no site;
- estados `Bridge conectado`, `Bridge não encontrado` e `Permissão de acesso local necessária`;
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
- helper `NfeAgendamento.Portal.exe` em WinForms/WebView2 com hCaptcha sempre manual;
- helper Portal em modo servidor persistente com IPC local por Named Pipe, reaproveitando o processo/WebView2 entre consultas e reiniciando a sessão após falha de comunicação;
- disponibilidade do Portal verificada por probe headless do WebView2 Runtime, com resultado positivo cacheado, sem abrir janela durante `/health`;
- polling web do resultado do Portal reduzido para 250 ms;
- proteção de instância única no executável real do Bridge para evitar dois listeners locais concorrentes;
- shell `NfeAgendamento.App.exe` em `WinExe`, sem janela de console, com `NotifyIcon` na bandeja;
- duplo clique na bandeja abre o site oficial e o menu oferece **Abrir NFe Agendamento**, **Verificar atualizações** e **Sair**;
- atualizador manual consulta somente a release estável mais recente do repositório oficial, exige confirmação do usuário e valida asset, tamanho e SHA-256 antes de iniciar o Setup;
- o shell inicia `NfeAgendamento.Bridge.exe` com `CreateNoWindow` e encerra o Bridge ao sair ou antes de instalar atualização confirmada;
- deploy Cloudflare pela raiz usando `wrangler.jsonc` e `npx wrangler deploy --dry-run` no CI;
- Bridge, App e helper Portal atualmente versionados em `0.0.5` até a próxima release do instalador;
- ícone próprio azul-escuro/amarelo no App, Bridge e instalador;
- instalador Inno Setup por usuário em `%LOCALAPPDATA%\NFe Agendamento Bridge`, sem UAC/admin;
- auto-start em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` apontando para `NfeAgendamento.App.exe`;
- App, Bridge e helper Portal publicados como **self-contained win-x64**, sem exigir instalação externa do .NET 10;
- CI gera `NFeAgendamentoBridge-Setup-v0.0.5` e `NfeAgendamentoBridge-win-x64` enquanto a versão de distribuição permanecer `0.0.5`;
- workflow da `v0.0.5` só publica artifacts provenientes do mesmo CI verde e do commit marcador `release: v0.0.5`.

## Pendência para uso real

A automação cobre build, testes e empacotamento, mas ainda é necessário executar o **teste físico Windows** em `docs/testing/acceptance.md` antes de declarar a versão validada em produção, incluindo:

- instalar/desinstalar o Setup em Windows real e confirmar ausência de UAC;
- confirmar que nenhuma janela preta de console permanece aberta;
- confirmar o ícone do NFe Agendamento na bandeja e o menu **Abrir NFe Agendamento / Verificar atualizações / Sair**;
- confirmar que o Setup não pede URL e que o site oficial conecta diretamente ao Bridge;
- confirmar que uma segunda abertura do app não cria outra instância de bandeja nem outro listener;
- confirmar auto-start após novo login;
- navegador real acessando o Bridge em loopback;
- certificado A1 real;
- consulta SEFAZ real;
- DANFE/PDF;
- ocorrência real ou controlada de limite/656 para validar WebView2 + Portal + hCaptcha manual + retorno do XML e reaproveitamento do helper numa segunda consulta;
- após publicação de uma versão posterior, validar o fluxo físico de atualização descrito em `docs/testing/bridge-updater.md`;
- segundo PC independente com seu próprio App/Bridge.

## Fora de escopo

Não existem Central, pareamento, líder/standby, servidor LAN, pasta compartilhada, login, banco, histórico, consulta em lote ou **atualização silenciosa/automática** do Bridge. A atualização existente é iniciada e confirmada manualmente pelo usuário no app da bandeja.

## Desenvolvimento

```bash
npm install
npm run test:web
npm run build:web

dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.App/NfeAgendamento.App.csproj -c Release
```

## Deploy Cloudflare

O Cloudflare Workers Builds pode usar o comando padrão na raiz:

```bash
npx wrangler deploy
```

O `wrangler.jsonc` executa `npm run build:web` e publica `./apps/web/dist`. O CI também executa `npx wrangler deploy --dry-run`.

## Distribuição Windows v0.0.5

Para uso normal da release pública atual, use:

```text
NFeAgendamentoBridge-Setup-v0.0.5.exe
```

O instalador:

- instala somente para o usuário atual em `%LOCALAPPDATA%\NFe Agendamento Bridge`;
- não solicita administrador;
- mantém App + Bridge + helper Portal lado a lado;
- inclui o runtime .NET necessário no publish self-contained;
- cria atalho **NFe Agendamento** no Menu Iniciar apontando para `NfeAgendamento.App.exe`;
- registra início automático do App no login do usuário;
- inicia o App ao finalizar quando a opção estiver marcada;
- o App inicia o Bridge em segundo plano sem console e fica na bandeja;
- **não pede URL nem origem**: a origem oficial de produção já está embutida no Bridge;
- remove auto-start e arquivos instalados na desinstalação;
- preserva `%LOCALAPPDATA%\NfeAgendamentoBridge`, onde fica a seleção local do certificado;
- não instala atualizações silenciosamente.

O código atual do App já possui **Verificar atualizações** na bandeja. Para esse recurso chegar a uma instalação pública `v0.0.5`, será necessário publicar uma nova versão do instalador contendo esse código. Depois disso, versões seguintes poderão ser descobertas e instaladas pelo próprio App com confirmação do usuário e verificação SHA-256 do asset da release.

O site de produção autorizado é exatamente:

```text
https://nfeagendamento.joaolds.xyz.br
```

Não existe wildcard de CORS/Origin. O `NfeAgendamentoBridge-win-x64.zip` continua como fallback técnico. O .NET 10 não precisa estar previamente instalado para a distribuição `v0.0.5`. O **Microsoft Edge WebView2 Runtime** continua necessário somente para o fallback pelo Portal Nacional; o Bridge verifica sua disponibilidade por um probe headless do helper.

A `v0.0.5` substitui a `v0.0.4` para novos testes físicos. A `v0.0.4` iniciava diretamente o executável de console do Bridge; a `v0.0.5` introduziu o shell real de bandeja.

## Documentação

- arquitetura/segurança: `docs/architecture/bridge-security.md`;
- aceitação física: `docs/testing/acceptance.md`;
- atualizador manual: `docs/testing/bridge-updater.md`;
- notas da release `v0.0.5`: `docs/releases/v0.0.5.md`;
- notas históricas da `v0.0.4`: `docs/releases/v0.0.4.md`;
- design do fallback Portal persistente: `docs/superpowers/specs/2026-09-09-persistent-portal-fallback-design.md`;
- plano do fallback Portal persistente: `docs/superpowers/plans/2026-09-09-persistent-portal-fallback-implementation.md`;
- design de confiabilidade `v0.0.4`: `docs/superpowers/specs/2026-09-08-v0.0.4-reliability-design.md`;
- plano de implementação `v0.0.4`: `docs/superpowers/plans/2026-09-08-v0.0.4-reliability-implementation.md`;
- design do instalador: `docs/superpowers/specs/2026-09-08-windows-installer-design.md`;
- plano do instalador: `docs/superpowers/plans/2026-09-08-windows-installer-implementation.md`;
- plano técnico canônico: `docs/superpowers/plans/2026-09-08-nfe-agendamento-2-implementation.md`.
