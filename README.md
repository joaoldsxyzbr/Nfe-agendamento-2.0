# NFe Agendamento 2.0

NFe Agendamento é um aplicativo interno para consultar NF-e, baixar XML e gerar DANFE mantendo o certificado A1 no Windows de cada computador.

## Arquitetura atual

- **Site Cloudflare:** Vite + TypeScript para interface, parsing XML, DANFE, lote e regras de apresentação.
- **Worker Cloudflare:** coordena o consumo fiscal entre PCs, aplica a barreira HTTP contra abuso e faz proxy estritamente limitado da metadata/Setup de atualização; os demais assets continuam servidos como site estático.
- **Durable Object SQLite:** reserva atomicamente tentativas diretas antes da SEFAZ para computadores que usam o mesmo A1 RSA.
- **App Windows:** `NfeAgendamento.App.exe` em WinForms; inicia oculto, fica na bandeja, gerencia o Bridge e oferece atualização manual.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345`, somente loopback.
- **Controle App → Bridge:** Named Pipe local restrito ao usuário atual, com lease, heartbeat e shutdown controlado.
- **Helper Portal:** WinForms/WebView2 persistente para o fallback pelo Portal Nacional; hCaptcha continua sempre manual.
- **Certificado A1:** descoberto em `CurrentUser/My`; PFX, senha e chave privada nunca são enviados ao site ou ao Cloudflare.
- **Persistência local:** thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`, regras locais de fornecedor em `supplier-rules.json` e metadados da proteção fiscal em `fiscal-usage.json`.
- **Versão canônica atual:** `0.0.16`; a publicação da release é automatizada somente após o CI do commit `release: v0.0.16` ficar verde.

Não existem Central, pareamento, servidor LAN, mDNS ou pasta compartilhada na arquitetura atual. Cada PC usa seu próprio Bridge.

## Estado funcional — 18/09/2026

Implementado e coberto pelos gates automatizados aplicáveis:

- consulta unificada para uma ou várias NF-e, com layout compacto para uma única NF-e;
- chave NF-e de **44 caracteres**, incluindo CNPJ/chave alfanuméricos e DV vigente;
- rejeição explícita de NFC-e modelo 65; o produto aceita somente NF-e modelo 55;
- seleção local de certificado A1;
- transporte autenticado `NFeDistribuicaoDFe`;
- categorias normalizadas `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable` e `technical_error`;
- tratamento de `137`, `138`, `656`, HTTP 429, timeout e falhas ambíguas sem retry fiscal automático;
- fallback automático para o Portal após `consumption_limit` ou `cStat 217`;
- hCaptcha manual e download oficial do XML pelo helper Portal;
- XML limitado a 10 MiB, DTD proibido e validação contra a chave consultada;
- download XML individual e ZIP do lote;
- preview DANFE em modal com `Ctrl + scroll`, impressão/PDF e download XML;
- DANFE com grade operacional de **13 colunas**, `Item` na primeira posição, composição de embalagem quando derivável do XML e cabeçalhos fiscais nas folhas adicionais; NCM/IPI permanecem preservados no XML, mas fora da grade visual principal;
- código de barras híbrido CODE-128C/CODE-128A para chave alfanumérica;
- paginação determinística, sem medição frágil de viewport em `beforeprint`;
- Playwright/Chromium gerando PDF A4 real no CI e validando overflow, paginação, grade simplificada, cabeçalhos, `Folha X/Y` e chave alfanumérica;
- regras específicas de fornecedores centralizadas, com identificação primária por CNPJ/CPF resolvida somente no Bridge local e sem identificadores fiscais fixos no bundle público;
- proteção fiscal local persistente e fail-safe;
- coordenação compartilhada do teto fiscal entre PCs que usam o mesmo A1 RSA;
- barreira HTTP global de 300 requisições por 60 segundos antes do `FiscalCoordinator`, usando o Rate Limiting binding nativo do Cloudflare Workers;
- POC isolado de `Unimake.DFe` para paridade de chave alfanumérica e estrutura RTC;
- parser estrutural complementar de IBS/CBS/IS, sem alterar prematuramente o DANFE;
- App, Bridge e Portal publicados como self-contained `win-x64`;
- instalador Inno Setup por usuário, sem administrador;
- atualizador manual via domínio oficial, com metadata/Setup intermediados pelo Worker e validação local de release, tamanho e SHA-256;
- logs locais estruturados com rotação e sem persistir chave NF-e, XML, PFX, senha ou chave privada.

## Proteção fiscal local e multi-PC

O Bridge mantém `FiscalUsageGuard` local com gate serial, janela de uma hora e persistência durável. Estado local corrompido falha de forma conservadora: a rota SEFAZ é protegida e a consulta segue pelo Portal.

Além disso, antes de uma chamada direta à SEFAZ, o Bridge reserva uma tentativa no coordenador Cloudflare. A credencial de coordenação é derivada localmente por assinatura RSA/SHA-256 usando a chave privada do mesmo A1 e é enviada somente por HTTPS. O Worker usa SHA-256 dessa credencial para selecionar um Durable Object; ele não recebe CNPJ, chave NF-e, XML, PFX, senha ou chave privada.

Antes de calcular esse namespace ou acessar o Durable Object, o Worker aplica `COORDINATION_RATE_LIMITER` com uma chave lógica global `fiscal-coordination`, limite de 300 requisições por 60 segundos. Esse limiter é apenas uma barreira aproximada contra abuso e custo: ele **não** substitui a janela fiscal exata. Negação retorna HTTP `429` com `Retry-After: 60`; falha ou resultado inválido do binding retorna `503`. Em ambos os casos o `FiscalCoordinator` não é acessado.

PCs que usam cópias do **mesmo A1 RSA** compartilham a mesma janela de 20 tentativas por hora. `429` e `cStat 656` propagam cooldown compartilhado. Se o coordenador estiver indisponível ou responder de forma inválida, o Bridge **não toca na SEFAZ** e retorna `consumption_limit`, fazendo o frontend seguir pelo Portal.

Limitação consciente: certificados diferentes do mesmo CNPJ não compartilham a mesma identidade remota. O projeto evita enviar ou registrar a identidade fiscal no coordenador remoto.

Detalhes: `docs/architecture/fiscal-usage-guard.md`.

## Fallback pelo Portal Nacional

Fluxo nominal:

```text
Site
  → Bridge local
    → proteção local + coordenação multi-PC
      → consulta direta SEFAZ
        → sucesso: XML → site/DANFE
        → limite/217: Portal Nacional
```

No Portal, o helper preenche a chave, aguarda o usuário resolver o hCaptcha, continua observando a página oficial, aciona o download permitido, usa o A1 selecionado e valida o XML antes de devolvê-lo ao site. O helper não resolve nem contorna captcha.

Detalhes: `docs/testing/portal-post-hcaptcha.md`.

## Regras locais de fornecedor

O site usa o CNPJ/CPF do emitente já presente no XML somente para consultar o Bridge local em `127.0.0.1`. O Bridge compara esse identificador com `%LOCALAPPDATA%\NfeAgendamentoBridge\supplier-rules.json` e devolve apenas um `supplierId` lógico, como `souza-cruz`, `fernando-klein` ou `dionisio`. Nenhum novo dado fiscal de fornecedor é enviado ao Cloudflare.

O arquivo local aceita múltiplos identificadores por fornecedor, suporta CNPJ alfanumérico e falha de forma suave: configuração ausente, inválida ou fornecedor desconhecido simplesmente resulta em `supplierId: null`. Durante a migração, o frontend mantém o `xNome` normalizado como fallback temporário.

Os CNPJs/CPFs reais de fornecedores não pertencem ao repositório, testes, documentação, issues, pull requests ou logs. Eles são configurados apenas nas máquinas que executam o Bridge. Detalhes: `docs/architecture/supplier-rules.md`.

## Segurança

- Bridge somente em `127.0.0.1:17345`;
- validação estrita de Host e Origin;
- origem oficial: `https://nfeagendamento.joaolds.xyz.br`;
- CORS sem wildcard;
- chave privada/PFX/senha do A1 permanecem no Windows;
- coordenador remoto não recebe dados fiscais do documento;
- resolução de fornecedor acontece somente no Bridge loopback e retorna apenas `supplierId`;
- CNPJ/CPF real usado nas regras de fornecedor fica apenas no `supplier-rules.json` local e não entra em logs;
- rate limiter HTTP recebe somente a chave constante `fiscal-coordination` e atua antes do Durable Object fiscal;
- rotas de atualização do Worker aceitam apenas metadata da release estável e o Setup versionado com nome exato; não existe proxy de URL arbitrária;
- proteção local persiste somente hash do CNPJ, timestamps e prazos de proteção;
- `.gitignore` bloqueia PFX/P12/PEM/KEY e arquivos de ambiente;
- WebView2 limitado ao host oficial do Portal e HTTPS;
- downloads fora do endpoint XML oficial são cancelados;
- Named Pipes locais restritos ao usuário atual;
- Actions do GitHub fixadas por SHA e permissões mínimas;
- secrets de Authenticode não entram em builds de pull request;
- CI inclui `npm audit` e NuGet Audit no POC fiscal;
- CodeQL analisa automaticamente JavaScript/TypeScript e C# em `main`, pull requests e uma execução semanal;
- Dependabot verifica semanalmente npm, Playwright, NuGet e GitHub Actions e propõe atualizações por pull request.

## CI

Jobs obrigatórios do pipeline:

- `web` — install/audit/lint/format/test/build e `wrangler deploy --dry-run`;
- `danfe-print` — regressão real de PDF A4 com Chromium;
- `bridge` — testes e build .NET;
- `fiscal-compatibility` — POC Unimake e paridade fiscal;
- `windows-package` — empacotamento Windows somente depois dos gates anteriores.

O workflow separado `CodeQL` complementa o CI com análise estática de segurança. O Dependabot apenas abre propostas de atualização; nenhuma dependência é atualizada automaticamente na `main`.

## Validações/configurações externas ainda pendentes

O código e a release podem ser produzidos no repositório, mas três controles continuam dependendo do ambiente real:

- **A4 físico:** executar o checklist em Windows/impressora real para declarar a release fisicamente validada;
- **Authenticode:** fornecer/configurar certificado real de code signing e secrets do ambiente de release;
- **proteção da `main`:** habilitar ruleset/branch protection e checks obrigatórios com permissão administrativa no GitHub.

A evolução RTC/IBS/CBS além do parser estrutural só deve acontecer quando houver cenários reais do projeto e exigência clara do leiaute oficial vigente.

## Desenvolvimento

```bash
npm ci
npm audit --audit-level=high
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web
./node_modules/.bin/wrangler deploy --dry-run

dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release --no-restore

dotnet run --project tests/unimake-poc/UnimakePoc.csproj -c Release

npm ci --prefix tests/playwright
npm test --prefix tests/playwright
```

O SDK esperado está em `global.json`. Mudanças de `PackageReference` com lockfile devem atualizar e revisar o `packages.lock.json` correspondente.

## Deploy Cloudflare

A raiz contém `wrangler.jsonc`. O deploy publica o site e o Worker de coordenação no mesmo Worker Cloudflare:

```bash
npx wrangler deploy
```

`/api/fiscal-coordination/*`, `/api/update/*` e `/downloads/windows/*` passam pelo Worker antes dos assets; as demais rotas continuam usando os assets do site. O fluxo fiscal mantém seu gate próprio. As rotas de atualização consultam apenas a release oficial do repositório e fazem streaming apenas do Setup cujo tag e nome correspondam ao padrão esperado.

O CI usa o Wrangler do lockfile e executa `./node_modules/.bin/wrangler deploy --dry-run`.

## Atualizações e download do App

O navegador e o App não dependem mais de acesso direto do cliente ao GitHub para baixar o Setup.

- `GET /api/update/latest` consulta a release estável oficial server-side e devolve somente a metadata necessária, reescrevendo a URL do asset para o domínio do NFe Agendamento;
- `GET /downloads/windows/vX.Y.Z/NFeAgendamentoBridge-Setup-vX.Y.Z.exe` valida tag/nome e faz streaming do único Setup permitido;
- o Worker não aceita host, URL ou nome de arquivo arbitrários;
- o App continua validando tamanho publicado e SHA-256 antes de executar o instalador.

**Migração da v0.0.15:** o binário antigo ainda contém a URL direta do GitHub. Se a atualização interna da v0.0.15 falhar, baixar e instalar a v0.0.16 uma vez pelo botão do próprio site. A partir da v0.0.16, as atualizações passam pelo domínio oficial.

## Distribuição Windows

Versão canônica da release: **v0.0.16**.

Asset principal:

```text
NFeAgendamentoBridge-Setup-v0.0.16.exe
```

O instalador é por usuário, não pede administrador, mantém App + Bridge + helper Portal lado a lado, cria atalho no Menu Iniciar, registra início automático e preserva `%LOCALAPPDATA%\NfeAgendamentoBridge` — incluindo configurações locais como `settings.json`, `fiscal-usage.json` e `supplier-rules.json`.

O Microsoft Edge WebView2 Runtime é necessário para o fallback pelo Portal Nacional.

## Fluxo de release

1. concluir os critérios técnicos aplicáveis;
2. atualizar a versão em `Directory.Build.props`;
3. adicionar `docs/releases/v<versão>.md`;
4. fazer o commit final `release: v<versão>`;
5. aguardar o CI testar, compilar e empacotar;
6. `release.yml` publica apenas os artifacts daquele mesmo CI verde e fixa a tag no SHA validado.

## Validação física

O CI não consegue provar interação real com certificado A1, SEFAZ, Portal/hCaptcha ou uma impressora específica. Para declarar a v0.0.16 fisicamente validada, executar:

- `docs/testing/acceptance.md`;
- `docs/testing/batch-query.md`;
- `docs/testing/danfe-layout.md`;
- `docs/testing/portal-post-hcaptcha.md`.

Para as regras locais de fornecedor, validar uma NF-e real de cada fornecedor configurado e registrar no GitHub somente o resultado da validação, nunca o CNPJ/CPF usado no arquivo local.

Não provoque bloqueio `656` repetindo consultas artificialmente apenas para testar o fallback.

## Documentação

- segurança do Bridge: `docs/architecture/bridge-security.md`;
- fronteiras do frontend: `docs/architecture/frontend-boundaries.md`;
- proteção fiscal local e compartilhada: `docs/architecture/fiscal-usage-guard.md`;
- POC Unimake.DFe: `docs/architecture/unimake-poc.md`;
- RTC / IBS / CBS: `docs/architecture/rtc-ibs-cbs.md`;
- regras de fornecedores: `docs/architecture/supplier-rules.md`;
- hardening fiscal atual: `docs/superpowers/plans/2026-09-15-fiscal-hardening-open-source.md`;
- hardening do repositório: `docs/operations/repository-hardening.md`;
- logging local: `docs/operations/local-logging.md`;
- aceitação geral: `docs/testing/acceptance.md`;
- lote: `docs/testing/batch-query.md`;
- Portal pós-hCaptcha: `docs/testing/portal-post-hcaptcha.md`;
- atualizador: `docs/testing/bridge-updater.md`;
- DANFE: `docs/testing/danfe-layout.md`;
- tela de consulta: `docs/ui/consultation-screen.md`;
- release atual: `docs/releases/v0.0.16.md`.
