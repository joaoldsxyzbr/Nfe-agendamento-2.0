# NFe Agendamento 2.0

Reescrita limpa do NFe Agendamento com **site estático + App/Bridge Windows local**.

## Arquitetura atual

- **Site:** Vite + TypeScript; concentra interface, parsing XML, DANFE e regras de apresentação.
- **App Windows:** `NfeAgendamento.App.exe` em WinForms; inicia oculto, permanece na bandeja, gerencia o lifecycle do Bridge e oferece atualização manual confirmada pelo usuário.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345` somente.
- **Controle App → Bridge:** Named Pipe local separado da API web, restrito ao usuário atual, com identidade, lease, heartbeat e shutdown controlado.
- **API local:** `/api/v1`.
- **Certificado A1:** descoberto em `CurrentUser/My`; a chave privada nunca sai do Windows/Bridge.
- **Persistência:** somente o thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`.
- **Fallback Portal:** helper Windows separado com WebView2, Portal Nacional fixo, hCaptcha sempre manual e processo persistente reutilizado entre consultas.
- **Distribuição Windows:** instalador Inno Setup por usuário, sem administrador, com início automático do app na bandeja no login.
- **Versão canônica atual:** `0.0.7` em `Directory.Build.props`.

## Estado funcional — 10/09/2026

Implementado e coberto pelos gates automatizados do projeto:

- Vite/TypeScript no frontend e .NET 10 no Bridge/App/Portal;
- dependências npm fixadas por `package-lock.json`, `npm ci` e `npm audit --audit-level=high` no CI;
- dependências NuGet em locked mode;
- tema dark e DANFE A4 branco/fiscal;
- preview DANFE em modal com `Ctrl + scroll`, impressão/PDF e download XML;
- tratamento Fernando Klein preservando o `cProd` fiscal no XML;
- painel de configurações para certificado A1;
- interface de consulta simplificada com resultado integrado e ação **Nova consulta**;
- atalho no topo do site para baixar o Setup Windows da release atual;
- `GET /api/v1/health`, certificados, seleção de A1, lookup NF-e e endpoints do Portal;
- validação completa de chave NF-e de 44 dígitos;
- transporte autenticado para `NFeDistribuicaoDFe` usando o A1 selecionado;
- categorias normalizadas `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable` e `technical_error`;
- tratamento de `137`, `138`, `656`, HTTP 429, timeout e falhas ambíguas sem retry fiscal automático;
- XML limitado a 10 MiB, DTD proibido, `XmlResolver = null` e validação contra a chave consultada;
- fallback automático somente após `consumption_limit`;
- helper `NfeAgendamento.Portal.exe` em WinForms/WebView2, persistente e reconectável por Named Pipe local;
- uma operação Portal por PC;
- cancelamento Portal end-to-end;
- reutilização do WebView2 entre operações sequenciais;
- probe headless do WebView2 Runtime com resultado positivo cacheado;
- instância única do Bridge;
- App inicia Bridge gerenciado com lease/heartbeat e recuperação com backoff;
- tray com **Abrir NFe Agendamento**, **Verificar atualizações** e **Sair**;
- atualizador manual valida release estável, nome/URL do asset, tamanho e SHA-256 antes de executar o Setup;
- App, Bridge e Portal publicados como **self-contained win-x64**;
- instalador por usuário em `%LOCALAPPDATA%\NFe Agendamento Bridge`, sem UAC/admin;
- CI com jobs `web`, `bridge` e `windows-package`;
- release criada somente a partir dos artifacts do mesmo CI verde do commit marcador `release: v<versão>`.

## Fallback pelo Portal Nacional

Fluxo nominal:

```text
Site
  → Bridge local
    → consulta direta SEFAZ
      → sucesso: XML → site/DANFE
      → consumption_limit: Portal Nacional
```

Durante o fallback Portal:

1. o helper abre a página oficial e preenche a chave automaticamente;
2. o usuário resolve **manualmente** o hCaptcha;
3. somente depois de existir resposta válida em `h-captcha-response`, o helper aciona a consulta oficial;
4. ao reconhecer **Download do Documento**, o helper aciona o download oficial;
5. `Alert`/`Confirm` só pode ser aceito durante esse clique controlado;
6. o A1 previamente selecionado é escolhido pelo thumbprint;
7. somente `/portal/downloadNFe.aspx` é aceito como download XML;
8. o XML é validado e devolvido ao Bridge/site;
9. a janela volta ao estado ocioso.

O helper **não resolve nem contorna captcha**. Continuam ausentes `hcaptcha.execute`, `grecaptcha.execute`, serviços externos de resolução, fabricação de token e clique sintético dentro do desafio.

Detalhes: `docs/testing/portal-post-hcaptcha.md`.

## Segurança

- Bridge escuta somente `127.0.0.1:17345`;
- Host e Origin são validados de forma estrita;
- origem oficial de produção: `https://nfeagendamento.joaolds.xyz.br`;
- CORS sem wildcard;
- chave privada/PFX/senha do A1 não são enviados ao site;
- WebView2 navega apenas em HTTPS no host oficial `www.nfe.fazenda.gov.br`;
- navegação externa e popups externos são bloqueados;
- download fora do endpoint XML oficial é cancelado;
- IPC do helper e controle App → Bridge usam Named Pipe local restrito ao usuário atual;
- não existem Central, pareamento, servidor LAN, mDNS ou pasta compartilhada nesta arquitetura.

Dois hardenings externos continuam pendentes:

- **Authenticode:** App/Bridge/Portal/Setup não têm publisher assinado enquanto não houver certificado de code signing disponível ao pipeline;
- **proteção da `main`:** branch protection/rulesets dependem de configuração administrativa do GitHub.

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

O SDK esperado está em `global.json`. Mudanças de `PackageReference` devem atualizar e revisar o `packages.lock.json` correspondente.

## Deploy Cloudflare

O deploy do site usa a configuração da raiz:

```bash
npx wrangler deploy
```

O CI também executa `npx wrangler deploy --dry-run`.

## Distribuição Windows

Release pública atual: **v0.0.7**.

Asset principal:

```text
NFeAgendamentoBridge-Setup-v0.0.7.exe
```

O instalador:

- instala somente para o usuário atual;
- não solicita administrador;
- mantém App + Bridge + helper Portal lado a lado;
- cria atalho no Menu Iniciar;
- registra início automático do App no login;
- preserva `%LOCALAPPDATA%\NfeAgendamentoBridge`, onde fica a seleção local do certificado;
- não instala atualizações silenciosamente.

Quem estiver na v0.0.6 pode usar **Verificar atualizações** no app da bandeja para instalar a v0.0.7 após confirmação.

O Microsoft Edge WebView2 Runtime é necessário somente para o fallback pelo Portal Nacional.

## Fluxo de release

1. atualizar a versão apenas em `Directory.Build.props`;
2. adicionar `docs/releases/v<versão>.md`;
3. fazer o commit final com mensagem exata `release: v<versão>`;
4. aguardar o CI testar, compilar e empacotar;
5. `release.yml` publica somente os artifacts daquele mesmo CI verde e fixa a tag no SHA validado.

## Validação física

O CI valida código, builds e empacotamento, mas não consegue provar a interação externa real com Portal Nacional, hCaptcha, certificado A1 e SEFAZ.

Antes de declarar a release fisicamente validada, executar `docs/testing/acceptance.md`. Para o fluxo pós-hCaptcha, usar também `docs/testing/portal-post-hcaptcha.md`.

Não provoque bloqueio `656` repetindo consultas artificialmente apenas para testar o fallback.

## Documentação

- arquitetura/segurança: `docs/architecture/bridge-security.md`;
- aceitação física: `docs/testing/acceptance.md`;
- automação pós-hCaptcha: `docs/testing/portal-post-hcaptcha.md`;
- atualizador manual: `docs/testing/bridge-updater.md`;
- layout DANFE: `docs/testing/danfe-layout.md`;
- notas da release atual: `docs/releases/v0.0.7.md`.
