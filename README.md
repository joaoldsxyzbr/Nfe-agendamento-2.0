# NFe Agendamento 2.0

NFe Agendamento é um aplicativo interno para consultar NF-e, baixar XML e gerar DANFE mantendo o certificado A1 no Windows de cada computador.

## Arquitetura atual

- **Site Cloudflare:** Vite + TypeScript para interface, parsing XML, DANFE, lote e regras de apresentação.
- **Worker Cloudflare:** coordena o consumo fiscal entre PCs, aplica a barreira HTTP contra abuso e faz proxy estritamente limitado da metadata/Setup de atualização; os demais assets continuam servidos como site estático.
- **Durable Object SQLite:** reserva atomicamente tentativas diretas antes da SEFAZ para computadores que usam o mesmo A1 RSA.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345`, somente loopback.
- **Extensão Portal (piloto):** Chromium Manifest V3 abre o Portal Nacional em popup do navegador e devolve o XML ao site; hCaptcha continua sempre manual.
- **Helper Portal:** WinForms/WebView2 persistente preservado como rollback enquanto a extensão não for validada fisicamente.
- **Certificado A1:** descoberto em `CurrentUser/My`; PFX, senha e chave privada nunca são enviados ao site ou ao Cloudflare.
- **Persistência local:** thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`, regras locais de fornecedor em `supplier-rules.json` e metadados da proteção fiscal em `fiscal-usage.json`.
- **Release pública atual:** `0.0.22`; publicada somente a partir do mesmo SHA validado pelo CI completo.

Não existem Central, pareamento, servidor LAN, mDNS ou pasta compartilhada na arquitetura atual. Cada PC usa seu próprio Bridge.

## Estado funcional — 22/09/2026

Implementado e coberto pelos gates automatizados aplicáveis:

- consulta unificada para uma ou várias NF-e, com layout compacto para uma única NF-e, card estruturalmente estático após conclusão e teto operacional de **100 NF-e por lote**;
- chave NF-e de **44 caracteres**, incluindo CNPJ/chave alfanuméricos e DV vigente;
- rejeição explícita de NFC-e modelo 65; o produto aceita somente NF-e modelo 55;
- seleção local de certificado A1;
- contrato aditivo de capabilities no health do Bridge, mantendo compatibilidade do site novo com o Bridge v0.0.17;
- transporte autenticado `NFeDistribuicaoDFe`;
- categorias normalizadas `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable` e `technical_error`;
- tratamento de `137`, `138`, `656`, HTTP 429, timeout e falhas ambíguas sem retry fiscal automático;
- fallback automático para o Portal após `consumption_limit` ou `cStat 217`, preferindo a extensão Chromium quando disponível e mantendo o helper WebView2 como rollback;
- prewarm best-effort do Portal/WebView2 após health compatível, sem bloquear consulta direta nem fallback cold-start;
- importação manual de XML validado, disponível somente como contingência após falha terminal do helper Portal;
- hCaptcha manual e download oficial do XML pelo helper Portal;
- XML limitado a 10 MiB, DTD proibido e validação contra a chave consultada;
- download XML individual e ZIP do lote, com orçamento agregado de memória e geração sem buffer monolítico duplicado;
- preview DANFE em modal com `Ctrl + scroll`, impressão/PDF e download XML;
- DANFE com grade operacional de **13 colunas**, `Item` na primeira posição, composição de embalagem quando derivável do XML e cabeçalhos fiscais nas folhas adicionais; NCM/IPI permanecem preservados no XML, mas fora da grade visual principal;
- código de barras híbrido CODE-128C/CODE-128A para chave alfanumérica;
- paginação determinística, sem medição frágil de viewport em `beforeprint`;
- Playwright/Chromium gerando PDF A4 real no CI e validando overflow, paginação, grade simplificada, cabeçalhos, `Folha X/Y` e chave alfanumérica, além de um fluxo E2E da consulta unitária e dos estados do card;
- regras específicas de fornecedores centralizadas, com identificação primária por CNPJ/CPF resolvida somente no Bridge local e sem identificadores fiscais fixos no bundle público;
- proteção fiscal local persistente e fail-safe;
- idempotência por `requestId` e coalescência de consultas simultâneas da mesma chave no Bridge, sem adicionar retry fiscal automático;
- coordenação compartilhada do teto fiscal entre PCs que usam o mesmo A1 RSA;
- barreira HTTP de 60 requisições por 60 segundos **por IP de cliente** antes do `FiscalCoordinator`, usando o Rate Limiting binding nativo do Cloudflare Workers;
- POC isolado de `Unimake.DFe` para paridade de chave alfanumérica e estrutura RTC;
- parser estrutural complementar de IBS/CBS/IS, sem alterar prematuramente o DANFE;
- Bridge e Portal publicados como self-contained `win-x64`;
- instalador Inno Setup por usuário, sem administrador;
- atualização apresentada pelo site via domínio oficial, com metadata cacheada por curto período, rate limit próprio e rota fechada para o Setup versionado; não existe updater paralelo no componente Windows;
- logs locais estruturados com rotação e sem persistir chave NF-e, XML, PFX, senha ou chave privada.

## Proteção fiscal local e multi-PC

O Bridge mantém `FiscalUsageGuard` local com gate serial, janela de uma hora e persistência durável. Estado local corrompido falha de forma conservadora: a rota SEFAZ é protegida e a consulta segue pelo Portal.

Além disso, antes de uma chamada direta à SEFAZ, o Bridge reserva uma tentativa no coordenador Cloudflare. A credencial de coordenação é derivada localmente por assinatura RSA/SHA-256 usando a chave privada do mesmo A1 e é enviada somente por HTTPS. O Worker usa SHA-256 dessa credencial para selecionar um Durable Object; ele não recebe CNPJ, chave NF-e, XML, PFX, senha ou chave privada.

Antes de calcular esse namespace ou acessar o Durable Object, o Worker aplica `COORDINATION_RATE_LIMITER` com chave derivada do `CF-Connecting-IP`, limite de 60 requisições por 60 segundos por IP. Esse limiter é apenas uma barreira aproximada contra abuso e custo: ele **não** substitui a janela fiscal exata. Negação retorna HTTP `429` com `Retry-After: 60`; falha ou resultado inválido do binding retorna `503`. Em ambos os casos o `FiscalCoordinator` não é acessado.

PCs que usam cópias do **mesmo A1 RSA** compartilham a mesma janela de 20 tentativas por hora. `429` e `cStat 656` propagam cooldown compartilhado. Se o coordenador estiver indisponível ou responder de forma inválida, o Bridge **não toca na SEFAZ** e retorna `consumption_limit`, fazendo o frontend seguir pelo Portal.

Limitações conscientes: certificados diferentes do mesmo CNPJ não compartilham a mesma identidade remota. Além disso, o Worker valida o **formato** do bearer, mas não consegue provar criptograficamente que ele foi gerado por um A1 sem introduzir um protocolo remoto adicional de identidade. O projeto preserva a fronteira atual e usa o rate limiter por IP como barreira de abuso, sem enviar CNPJ ou outro identificador fiscal novo.

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

No piloto atual, o site tenta primeiro a extensão Chromium MV3. Ela abre o Portal em popup do navegador, preenche a chave, aguarda o usuário resolver o hCaptcha e tenta devolver o XML oficial ao site pela própria sessão do Portal. Se a extensão não estiver disponível antes do início da operação, o fluxo volta ao helper WebView2 existente.

A v0.0.22 adiciona também `/extension-test.html`, um gate isolado que não usa `BridgeClient` nem `127.0.0.1:17345`. Ele existe somente para validar fisicamente site + extensão 0.2.0 + Portal + A1 antes da remoção do Bridge do fluxo principal.

O helper permanece empacotado e funcional até a validação física provar popup, certificado e retorno do XML em Chrome/Edge reais. Nenhum dos dois caminhos resolve ou contorna captcha.

Detalhes: `docs/testing/browser-extension-portal.md` e `docs/testing/portal-post-hcaptcha.md`.

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
- rate limiter fiscal usa somente o IP técnico da borda Cloudflare e atua antes do Durable Object; nenhum dado fiscal é usado como chave do limiter;
- rotas de atualização do Worker aceitam apenas metadata da release estável e o Setup versionado com nome exato, possuem rate limiter próprio por IP e cache curto da metadata; não existe proxy de URL arbitrária;
- proteção local persiste somente hash do CNPJ, timestamps e prazos de proteção;
- `.gitignore` bloqueia PFX/P12/PEM/KEY e arquivos de ambiente;
- WebView2 limitado ao host oficial do Portal e HTTPS; XMLs temporários antigos do diretório dedicado são limpos na inicialização do helper;
- downloads fora do endpoint XML oficial são cancelados;
- Actions do GitHub fixadas por SHA e permissões mínimas;
- assinatura Authenticode é opcional: quando os secrets de code signing estiverem configurados, o CI assina os artefatos; a ausência de assinatura não bloqueia builds nem releases;
- CI inclui `npm audit` e NuGet Audit no POC fiscal;
- CodeQL analisa automaticamente JavaScript/TypeScript e C# em `main`, pull requests e uma execução semanal, com a action fixada por SHA imutável;
- Dependabot verifica semanalmente npm, Playwright, NuGet e GitHub Actions e propõe atualizações por pull request.

## CI

Jobs obrigatórios do pipeline:

- `web` — install/audit/lint/format/test, **medição de cobertura V8**, build e `wrangler deploy --dry-run`;
- `extension` — audit, testes, typecheck, build MV3 e artifact ZIP instalável;
- `danfe-print` — regressão real de PDF A4 **e fluxo E2E da consulta** com Chromium;
- `bridge` — testes e build .NET;
- `fiscal-compatibility` — POC Unimake e paridade fiscal;
- `windows-package` — empacotamento Windows somente depois dos gates anteriores.

O workflow separado `CodeQL` complementa o CI com análise estática de segurança. O Dependabot apenas abre propostas de atualização; nenhuma dependência é atualizada automaticamente na `main`.

## Validação física

A validação técnica do repositório não depende de Authenticode nem de ruleset/branch protection. Esses dois controles são opcionais para este projeto.

A validação em Windows/impressora real continua separada do CI quando for necessária para confirmar interação física com A1, SEFAZ, Portal/hCaptcha e impressão A4.

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

## Atualizações e download do componente Windows

O site é o caminho normal para diagnosticar e atualizar o componente Windows. O painel compara `health.version` com a metadata oficial e apresenta a atualização quando houver versão estável mais nova.

- `GET /api/update/latest` consulta a release estável oficial server-side e devolve somente a metadata necessária, reescrevendo a URL do asset para o domínio do NFe Agendamento;
- `GET /downloads/windows/vX.Y.Z/NFeAgendamentoBridge-Setup-vX.Y.Z.exe` valida tag/nome e faz streaming do único Setup permitido;
- o Worker não aceita host, URL ou nome de arquivo arbitrários;
- a metadata validada usa cache curto no Worker e as rotas de atualização têm rate limiter próprio por IP;

**Migração da v0.0.15:** o binário antigo ainda contém a URL direta do GitHub. Se a atualização interna da v0.0.15 falhar, baixar e instalar a v0.0.16 uma vez pelo botão do próprio site. A partir da v0.0.16, as atualizações passam pelo domínio oficial.

## Distribuição Windows

Versão canônica da release: **v0.0.22**.

Asset principal:

```text
NFeAgendamentoBridge-Setup-v0.0.22.exe
```

O instalador é por usuário, não pede administrador e instala somente o Bridge + helper Portal. O auto-start HKCU e o start pós-instalação apontam diretamente para `NfeAgendamento.Bridge.exe`, sem `--managed`. O Bridge é `WinExe`, portanto inicia sem janela de console, e preserva `%LOCALAPPDATA%\NfeAgendamentoBridge` — incluindo `settings.json`, `fiscal-usage.json` e `supplier-rules.json`.

A release também publica `NFeAgendamento-Extension-v0.2.0.zip` para o piloto Chromium e o gate isolado sem Bridge. O Microsoft Edge WebView2 Runtime continua necessário apenas para o fallback pelo helper Portal/WebView2.

## Fluxo de release

1. concluir os critérios técnicos aplicáveis;
2. atualizar a versão em `Directory.Build.props`;
3. adicionar `docs/releases/v<versão>.md`;
4. fazer o commit final `release: v<versão>`;
5. aguardar o CI testar, compilar e empacotar; se Authenticode estiver configurado, os artefatos são assinados opcionalmente;
6. `release.yml` publica apenas os artifacts daquele mesmo CI verde e fixa a tag no SHA validado.

## Validação física

O CI não consegue provar interação real com certificado A1, SEFAZ, Portal/hCaptcha ou uma impressora específica. Para declarar a v0.0.22 fisicamente validada, executar:

- `docs/testing/acceptance.md`;
- `docs/testing/batch-query.md`;
- `docs/testing/danfe-layout.md`;
- `docs/testing/browser-extension-portal.md`;
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
- arquitetura alvo site-first: `docs/superpowers/specs/2026-09-21-site-first-fiscal-agent-design.md`;
- plano de migração site-first: `docs/superpowers/plans/2026-09-21-site-first-fiscal-agent-implementation.md`;
- hardening do repositório: `docs/operations/repository-hardening.md`;
- logging local: `docs/operations/local-logging.md`;
- aceitação geral: `docs/testing/acceptance.md`;
- lote: `docs/testing/batch-query.md`;
- Portal via extensão Chromium: `docs/testing/browser-extension-portal.md`;
- Portal WebView2 pós-hCaptcha/rollback: `docs/testing/portal-post-hcaptcha.md`;
- atualizador: `docs/testing/bridge-updater.md`;
- DANFE: `docs/testing/danfe-layout.md`;
- tela de consulta: `docs/ui/consultation-screen.md`;
- release atual: `docs/releases/v0.0.22.md`;
- release anterior: `docs/releases/v0.0.21.md`.
