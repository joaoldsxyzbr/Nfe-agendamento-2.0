# NFe Agendamento 2.0

Reescrita limpa do NFe Agendamento com **site estático + App/Bridge Windows local**.

## Arquitetura atual

- **Site:** Vite + TypeScript; concentra interface, parsing XML, DANFE e regras de apresentação; usa o mesmo ícone visual do App/Bridge como favicon da aba do navegador.
- **App Windows:** `NfeAgendamento.App.exe` em WinForms; inicia oculto, permanece na bandeja, gerencia o lifecycle do Bridge e oferece atualização manual confirmada pelo usuário.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345` somente.
- **Controle App → Bridge:** Named Pipe local separado da API web, restrito ao usuário atual, com identidade, lease, heartbeat e shutdown controlado.
- **API local:** `/api/v1`.
- **Certificado A1:** descoberto em `CurrentUser/My`; a chave privada nunca sai do Windows/Bridge.
- **Persistência local:** thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json` e metadados não sensíveis de proteção fiscal em `fiscal-usage.json`; XMLs e chaves NF-e não são persistidos pelo Bridge.
- **Diagnóstico local:** log estruturado JSON Lines com rotação em `%LOCALAPPDATA%\NfeAgendamentoBridge\logs`, sem armazenar chave da NF-e, XML, PFX, senha, chave privada, mensagem ou stack trace de exceção; a interface também mostra um resumo de saúde do computador nas Configurações.
- **Regras por fornecedor:** catálogo declarativo centralizado em `apps/web/src/nfe/supplier-rules.ts`, sem condicionais de fornecedor espalhadas no renderizador do DANFE.
- **Fallback Portal:** helper Windows separado com WebView2, Portal Nacional fixo, hCaptcha sempre manual e processo persistente reutilizado entre consultas.
- **Distribuição Windows:** instalador Inno Setup por usuário, sem administrador, com início automático do app na bandeja no login.
- **Versão pública atual:** `0.0.13`. A `main` contém melhorias posteriores ainda não publicadas em uma nova release.

## Estado funcional — 15/09/2026

Implementado na `main` e coberto pelos gates automatizados aplicáveis do projeto:

- Vite/TypeScript no frontend e .NET 10 no Bridge/App/Portal;
- TypeScript em modo `strict`, lint adicional e verificação determinística de formato no CI;
- dependências npm fixadas por lockfile, `npm ci` e `npm audit --audit-level=high` no CI;
- dependências NuGet em locked mode onde fazem parte da aplicação; POC fiscal isolado com pacote fixado e NuGet Audit;
- GitHub Actions do CI/release fixadas por SHA imutável, checkout sem persistência de credencial e permissões mínimas;
- runners com versão explícita e timeout por job;
- Inno Setup do empacotamento fixado em `6.7.1`, com checksums obrigatórios e validação da versão instalada;
- pipeline preparado para Authenticode opcional; etapas que recebem secrets de assinatura executam somente em `push` confiável para `main`;
- `.gitignore` bloqueia preventivamente PFX/P12/PEM/KEY e arquivos de ambiente;
- tema dark e DANFE A4 branco/fiscal;
- preview DANFE em modal com `Ctrl + scroll`, impressão/PDF e download XML;
- DANFE mantém NCM/SH, coluna operacional `Item` após a descrição, cabeçalhos fiscais nas folhas adicionais e código de barras híbrido CODE-128C/CODE-128A para chave alfanumérica;
- paginação de impressão determinística, com `products-filler` e sem medição frágil de viewport durante `beforeprint`;
- Playwright/Chromium gera PDFs A4 reais no CI e valida paginação, overflow, ordem de itens, NCM/SH, cabeçalhos de continuação, `Folha X/Y` e chave alfanumérica;
- DANFE mostra a composição da embalagem (ex.: `CX C/ 20 UN`) quando ela pode ser determinada diretamente por `uCom/qCom` e `uTrib/qTrib` da NF-e;
- regras por fornecedor preservam os dados fiscais originais e aplicam apenas apresentação operacional declarativa;
- painel de configurações para certificado A1;
- painel de diagnóstico local com conexão do Bridge, versão, certificado selecionado, disponibilidade do WebView2, horário da última verificação e último erro da verificação;
- mensagens do diagnóstico ocultam chaves numéricas ou alfanuméricas de 44 posições;
- interface de consulta única com resultado integrado e ação **Nova consulta**;
- modo **Lote** na mesma tela, sem limite rígido de quantidade, com validação/deduplicação, processamento sequencial e todas as chaves visíveis em linhas individuais;
- cada NF-e concluída no lote libera imediatamente **Visualizar DANFE** e **Baixar XML**, com indicação da origem `SEFAZ` ou `Portal`;
- lote híbrido **SEFAZ → Portal**: `217` usa Portal apenas naquela NF-e; `656`/429/`consumption_limit` muda a rota restante para Portal sem nova tentativa fiscal;
- ações gerais do lote para cancelar, baixar somente XMLs concluídos em ZIP e imprimir somente DANFEs concluídos;
- `FiscalUsageGuard` local com gate serial, janela de uma hora, limite local, persistência por hash SHA-256 do CNPJ e gravação durável;
- estado fiscal local corrompido falha de forma conservadora: protege a rota SEFAZ por uma hora e direciona para o Portal em vez de zerar silenciosamente o histórico;
- cabeçalho com marca e nome **NF-e / Agendamento** como conteúdo semântico real no `<h1>`;
- atalho no topo do site para baixar o Setup Windows da release pública atual;
- `GET /api/v1/health`, certificados, seleção de A1, lookup NF-e e endpoints do Portal;
- chave de acesso NF-e de 44 caracteres com CNPJ numérico ou alfanumérico, DV conforme a regra vigente e rejeição explícita de NFC-e modelo 65; o produto aceita somente NF-e modelo 55;
- transporte autenticado para `NFeDistribuicaoDFe` usando o A1 selecionado;
- categorias normalizadas `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable` e `technical_error`;
- tratamento de `137`, `138`, `656`, HTTP 429, timeout e falhas ambíguas sem retry fiscal automático;
- XML limitado a 10 MiB, DTD proibido, `XmlResolver = null` no Bridge e validação contra a chave consultada;
- fallback automático após `consumption_limit` ou retorno SEFAZ `217` (`fiscal_status`), sem repetir a consulta fiscal direta;
- helper Portal continua observando o resultado após o hCaptcha e reconhece `Download do Documento` mesmo quando o Portal acrescenta sufixos visuais como `*`;
- clique em **Download do Documento** é automático;
- `AreDefaultScriptDialogsEnabled` fica desativado no WebView2 para que `ScriptDialogOpening` realmente intercepte o `Alert`/`Confirm` do Portal;
- a confirmação de certificado digital do Portal fica elegível por até 60 segundos, com validação de origem e conteúdo da mensagem antes do aceite;
- decisões de segurança do Portal centralizadas em política pura com testes comportamentais de host, HTTPS, paths, diálogo e temporários;
- XML temporário do Portal usa nome aleatório e não expõe a chave NF-e no nome do arquivo;
- o único passo humano nominal do fallback é resolver o hCaptcha;
- logging local rotativo do Bridge com Event IDs estáveis para falhas fiscais e lifecycle;
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
- POC isolado de `Unimake.DFe` compara nosso validador fiscal com a biblioteca para chave numérica/alfanumérica e confirma a disponibilidade dos modelos RTC usados no estudo;
- parser RTC complementar modela o núcleo de IBS/CBS/IS sem substituir o parser de produção nem alterar o DANFE antes do mapeamento fiscal de impressão;
- CI com jobs `web`, `danfe-print`, `bridge`, `fiscal-compatibility` e `windows-package`;
- `windows-package` só roda depois dos quatro gates anteriores;
- release criada somente a partir dos artifacts do mesmo CI verde do commit marcador `release: v<versão>`.

A **release pública v0.0.13 inclui a consulta em lote**. A `main` posterior à publicação contém o hardening fiscal/alfanumérico, melhorias do DANFE, Playwright, o POC Unimake e o suporte estrutural inicial de RTC descritos acima. Essas mudanças ainda não foram publicadas como nova versão.

## Fallback pelo Portal Nacional

Fluxo nominal da consulta única:

```text
Site
  → Bridge local
    → consulta direta SEFAZ
      → sucesso: XML → site/DANFE
      → consumption_limit: Portal Nacional
      → fiscal_status + cStat 217: Portal Nacional
```

Durante o fallback Portal:

1. o helper abre a página oficial e preenche a chave automaticamente;
2. o usuário resolve **manualmente** o hCaptcha;
3. somente depois de existir resposta válida em `h-captcha-response`, o helper aciona a consulta oficial;
4. o helper continua monitorando a página de resultado por até 10 minutos e reconhece o controle **Download do Documento** mesmo com sufixos como `*`;
5. o helper aciona o download oficial automaticamente;
6. o WebView2 intercepta os diálogos JavaScript do Portal via `ScriptDialogOpening`, com os diálogos padrão desativados conforme exigido pela API;
7. a confirmação de certificado digital associada ao clique controlado é aceita automaticamente, por até 60 segundos após o clique, somente quando o evento vem do host oficial e a mensagem contém `download` e `certificado digital`;
8. o A1 previamente selecionado é escolhido pelo thumbprint;
9. somente `/portal/downloadNFe.aspx` é aceito como download XML;
10. o download usa arquivo temporário com nome aleatório, sem incluir a chave NF-e no path;
11. o XML é validado contra a chave consultada e devolvido ao Bridge/site;
12. a janela volta ao estado ocioso.

No lote, o mesmo mecanismo é reutilizado de forma sequencial; o hCaptcha permanece manual para cada operação.

O helper **não resolve nem contorna captcha**. Continuam ausentes `hcaptcha.execute`, `grecaptcha.execute`, serviços externos de resolução, fabricação de token e clique sintético dentro do desafio.

Detalhes: `docs/testing/portal-post-hcaptcha.md`.

## Segurança

- Bridge escuta somente `127.0.0.1:17345`;
- Host e Origin são validados de forma estrita;
- origem oficial de produção: `https://nfeagendamento.joaolds.xyz.br`;
- CORS sem wildcard;
- chave privada/PFX/senha do A1 não são enviados ao site;
- logs locais não persistem chave NF-e, XML, PFX, senha, chave privada nem detalhes textuais de exceções;
- proteção fiscal persiste somente hash do CNPJ, timestamps UTC e prazos de proteção; não persiste chaves NF-e/XML;
- arquivos comuns de chave/certificado privado são ignorados preventivamente pelo Git;
- WebView2 navega apenas em HTTPS no host oficial `www.nfe.fazenda.gov.br`;
- navegação externa e popups externos são bloqueados;
- download fora do endpoint XML oficial é cancelado;
- IPC do helper e controle App → Bridge usam Named Pipe local restrito ao usuário atual;
- cadeia de build do GitHub Actions usa referências imutáveis para Actions e ferramenta de instalador versionada;
- secrets de Authenticode não são injetados no caminho de build de pull requests;
- não existem Central, pareamento, servidor LAN, mDNS ou pasta compartilhada nesta arquitetura.

Controles externos ainda dependentes de configuração fora do código:

- **Authenticode:** o pipeline está pronto para assinar App/Bridge/Portal/Setup com SHA-256 quando existir certificado real de code signing e os secrets forem configurados; sem isso os artifacts permanecem sem publisher assinado;
- **proteção da `main`:** a branch continua sem ruleset/branch protection ativo; a integração usada pelo projeto não possui permissão administrativa de escrita para criá-lo. A configuração recomendada está em `docs/operations/repository-hardening.md`.

## Pendências antes da próxima release

- executar o checklist físico A4 em Windows/impressora real; Playwright cobre Chromium/PDF, mas não margens e comportamento de driver físico;
- ampliar a validação RTC/IBS/CBS para cenários efetivamente necessários antes de conectar o wrapper novo ao fluxo principal ou imprimir campos novos;
- remover identificadores pessoais/internos do bundle público sem quebrar as regras operacionais de fornecedores; não substituir isso por hash simples de CPF em JavaScript;
- definir uma coordenação segura do limite SEFAZ por CNPJ entre vários PCs sem reintroduzir o antigo PC central;
- configurar Authenticode real e proteção administrativa da `main`;
- somente depois alinhar versão, notas e artifacts de uma nova release.

## Desenvolvimento

```bash
npm ci
npm audit --audit-level=high
npm run lint:web
npm run format:check:web
npm run test:web
npm run build:web

# normaliza apenas finais de linha/espaços finais quando necessário
npm run format:web

dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release --no-restore
dotnet build apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.App/NfeAgendamento.App.csproj -c Release

# POC fiscal isolado; não faz parte do caminho de produção
dotnet run --project tests/unimake-poc/UnimakePoc.csproj -c Release

# regressão real de impressão Chromium/PDF
npm ci --prefix tests/playwright
npm test --prefix tests/playwright
```

O SDK esperado está em `global.json`. Mudanças de `PackageReference` de projetos com lockfile devem atualizar e revisar o `packages.lock.json` correspondente. O POC Unimake permanece deliberadamente isolado da aplicação.

## Deploy Cloudflare

O deploy do site usa a configuração da raiz:

```bash
npx wrangler deploy
```

O CI executa o Wrangler instalado pelo lockfile com `./node_modules/.bin/wrangler deploy --dry-run`, sem fallback de download durante o job.

## Distribuição Windows

Release pública atual: **v0.0.13**.

Asset principal:

```text
NFeAgendamentoBridge-Setup-v0.0.13.exe
```

O instalador:

- instala somente para o usuário atual;
- não solicita administrador;
- mantém App + Bridge + helper Portal lado a lado;
- cria atalho no Menu Iniciar;
- registra início automático do App no login;
- preserva `%LOCALAPPDATA%\NfeAgendamentoBridge`, onde ficam as configurações locais não sensíveis;
- não instala atualizações silenciosamente.

Quem estiver na v0.0.12 pode usar **Verificar atualizações** no app da bandeja para instalar a v0.0.13 após confirmação.

O Microsoft Edge WebView2 Runtime é necessário somente para o fallback pelo Portal Nacional.

## Fluxo de release

1. concluir os critérios técnicos e a validação física aplicável;
2. atualizar a versão apenas em `Directory.Build.props`;
3. adicionar `docs/releases/v<versão>.md`;
4. fazer o commit final com mensagem exata `release: v<versão>`;
5. aguardar o CI testar, compilar e empacotar;
6. `release.yml` publica somente os artifacts daquele mesmo CI verde e fixa a tag no SHA validado.

## Validação física

O CI valida código, builds, empacotamento, compatibilidade fiscal do POC e PDF A4 em Chromium, mas não consegue provar a interação externa real com Portal Nacional, hCaptcha, certificado A1, SEFAZ nem uma impressora física específica.

Antes de declarar o comportamento atual fisicamente validado, executar `docs/testing/acceptance.md`, `docs/testing/batch-query.md`, `docs/testing/danfe-layout.md` e, para o fluxo pós-hCaptcha, `docs/testing/portal-post-hcaptcha.md`.

Não provoque bloqueio `656` repetindo consultas artificialmente apenas para testar o fallback.

## Documentação

- arquitetura/segurança geral: `docs/architecture/bridge-security.md`;
- proteção fiscal local: `docs/architecture/fiscal-usage-guard.md`;
- POC fiscal Unimake.DFe: `docs/architecture/unimake-poc.md`;
- RTC / IBS / CBS: `docs/architecture/rtc-ibs-cbs.md`;
- regras declarativas de fornecedores: `docs/architecture/supplier-rules.md`;
- desenho/implementação da consulta em lote: `docs/superpowers/specs/2026-09-14-batch-query-design.md`;
- plano atual de hardening fiscal: `docs/superpowers/plans/2026-09-15-fiscal-hardening-open-source.md`;
- hardening do repositório/distribuição: `docs/operations/repository-hardening.md`;
- logging local do Bridge: `docs/operations/local-logging.md`;
- aceitação física geral: `docs/testing/acceptance.md`;
- aceitação física do lote: `docs/testing/batch-query.md`;
- automação pós-hCaptcha: `docs/testing/portal-post-hcaptcha.md`;
- atualizador manual: `docs/testing/bridge-updater.md`;
- layout DANFE e regressão de impressão: `docs/testing/danfe-layout.md`;
- tela de consulta/configurações: `docs/ui/consultation-screen.md`;
- notas da release pública atual: `docs/releases/v0.0.13.md`.
