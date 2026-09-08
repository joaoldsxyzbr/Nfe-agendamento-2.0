# NFe Agendamento 2.0

Reescrita limpa do NFe Agendamento com **site estático + Bridge Windows mínimo**.

## Arquitetura atual

- **Site:** Vite + TypeScript; concentra interface, parsing XML, DANFE e regras de apresentação.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345` somente.
- **API local:** `/api/v1`.
- **Segurança:** Host estrito `127.0.0.1:17345`, CORS sem wildcard e origem oficial de produção fixa em `https://nfeagendamento.joaolds.xyz.br`.
- **Certificado A1:** descoberto em `CurrentUser/My`; a chave privada nunca sai do Windows/Bridge.
- **Persistência:** somente o thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`.
- **Fallback Portal:** helper Windows separado com WebView2, Portal Nacional fixo e hCaptcha sempre manual.
- **Distribuição Windows:** instalador Inno Setup por usuário, sem administrador, com início automático do Bridge no login.

## Estado funcional — 08/09/2026

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
- disponibilidade do Portal verificada por probe headless do WebView2 Runtime, sem abrir janela durante `/health`;
- proteção de instância única no executável real do Bridge para evitar dois listeners locais concorrentes;
- deploy Cloudflare pela raiz usando `wrangler.jsonc` e `npx wrangler deploy --dry-run` no CI;
- Bridge e helper versionados em `0.0.4`;
- ícone próprio azul-escuro/amarelo no Bridge e instalador;
- instalador Inno Setup por usuário em `%LOCALAPPDATA%\NFe Agendamento Bridge`, sem UAC/admin;
- auto-start em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`;
- Bridge e helper Portal publicados como **self-contained win-x64**, sem exigir instalação externa do .NET 10;
- CI gera `NFeAgendamentoBridge-Setup-v0.0.4` e `NfeAgendamentoBridge-win-x64`;
- workflow da `v0.0.4` só publica artifacts provenientes do mesmo CI verde e do commit marcador `release: v0.0.4`.

## Pendência para uso real

A automação cobre build, testes e empacotamento, mas ainda é necessário executar o **teste físico Windows** em `docs/testing/acceptance.md` antes de declarar a versão validada em produção, incluindo:

- instalar/desinstalar o Setup em Windows real e confirmar ausência de UAC;
- confirmar que o Setup não pede URL e que o site oficial conecta diretamente ao Bridge;
- confirmar que uma segunda abertura do Bridge não cria outra instância/listener;
- confirmar auto-start após novo login;
- navegador real acessando o Bridge em loopback;
- certificado A1 real;
- consulta SEFAZ real;
- DANFE/PDF;
- ocorrência real ou controlada de limite/656 para validar WebView2 + Portal + hCaptcha manual + retorno do XML;
- segundo PC independente com seu próprio Bridge.

## Fora de escopo

Não existem Central, pareamento, líder/standby, servidor LAN, pasta compartilhada, login, banco, histórico, consulta em lote ou updater automático do Bridge.

## Desenvolvimento

```bash
npm install
npm run test:web
npm run build:web

dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release
```

## Deploy Cloudflare

O Cloudflare Workers Builds pode usar o comando padrão na raiz:

```bash
npx wrangler deploy
```

O `wrangler.jsonc` executa `npm run build:web` e publica `./apps/web/dist`. O CI também executa `npx wrangler deploy --dry-run`.

## Distribuição Windows v0.0.4

Para uso normal, use:

```text
NFeAgendamentoBridge-Setup-v0.0.4.exe
```

O instalador:

- instala somente para o usuário atual em `%LOCALAPPDATA%\NFe Agendamento Bridge`;
- não solicita administrador;
- mantém Bridge + helper Portal lado a lado;
- inclui o runtime .NET necessário no publish self-contained;
- cria atalho no Menu Iniciar;
- registra início automático no login do usuário;
- inicia o Bridge ao finalizar quando a opção estiver marcada;
- **não pede URL nem origem**: a origem oficial de produção já está embutida no Bridge;
- remove auto-start e arquivos instalados na desinstalação;
- preserva `%LOCALAPPDATA%\NfeAgendamentoBridge`, onde fica a seleção local do certificado;
- não possui updater automático.

O site de produção autorizado é exatamente:

```text
https://nfeagendamento.joaolds.xyz.br
```

Não existe wildcard de CORS/Origin. O `NfeAgendamentoBridge-win-x64.zip` continua como fallback técnico. O .NET 10 não precisa estar previamente instalado para a distribuição `v0.0.4`. O **Microsoft Edge WebView2 Runtime** continua necessário somente para o fallback pelo Portal Nacional; o Bridge verifica sua disponibilidade por um probe headless do helper.

A `v0.0.4` substitui a `v0.0.3` para novos testes físicos. A `v0.0.3` exigia configuração manual da origem no Setup; essa etapa foi removida.

## Documentação

- arquitetura/segurança: `docs/architecture/bridge-security.md`;
- aceitação física: `docs/testing/acceptance.md`;
- notas da release `v0.0.4`: `docs/releases/v0.0.4.md`;
- design de confiabilidade `v0.0.4`: `docs/superpowers/specs/2026-09-08-v0.0.4-reliability-design.md`;
- plano de implementação `v0.0.4`: `docs/superpowers/plans/2026-09-08-v0.0.4-reliability-implementation.md`;
- design do instalador: `docs/superpowers/specs/2026-09-08-windows-installer-design.md`;
- plano do instalador: `docs/superpowers/plans/2026-09-08-windows-installer-implementation.md`;
- plano técnico canônico: `docs/superpowers/plans/2026-09-08-nfe-agendamento-2-implementation.md`.
