# NFe Agendamento 2.0

Reescrita limpa do NFe Agendamento com **site estático + Bridge Windows mínimo**.

## Arquitetura atual

- **Site:** Vite + TypeScript; concentra interface, parsing XML, DANFE e regras de apresentação.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345` somente.
- **API local:** `/api/v1`.
- **Segurança:** Host estrito `127.0.0.1:17345`, allowlist de `Origin`, CORS sem wildcard e produção fail-closed sem origem configurada.
- **Certificado A1:** descoberto em `CurrentUser/My`; a chave privada nunca sai do Windows/Bridge.
- **Persistência:** somente o thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`.
- **Fallback Portal:** helper Windows separado com WebView2, Portal Nacional fixo e hCaptcha sempre manual.

## Estado funcional — 08/09/2026

Concluído e validado automaticamente no CI:

- bootstrap Vite/TypeScript e .NET 10;
- build e testes web + Bridge;
- tema visual dark inspirado no site legado, com superfícies azul-escuras, azul como ação principal, amarelo como destaque e DANFE preservado branco/fiscal;
- certificado A1 movido para um painel de configurações aberto pela engrenagem no canto superior direito, mantendo o status do Bridge ao lado e preservando o mesmo fluxo de seleção local;
- `GET /api/v1/health` e detecção do Bridge pelo site;
- proteção de `Origin`/`Host` com testes de integração;
- `GET /api/v1/certificates` e `POST /api/v1/certificate/select`;
- filtro A1 por chave privada, validade e Client Authentication quando EKU estiver presente;
- seleção do certificado diretamente no site;
- estados `Bridge conectado`, `Bridge não encontrado` e `Permissão de acesso local necessária`;
- `POST /api/v1/nfe/lookup` com validação completa da chave de 44 dígitos;
- transporte para `NFeDistribuicaoDFe` autenticado pelo certificado A1 selecionado;
- SOAP `consChNFe` com CNPJ extraído com segurança do certificado e `cUFAutor` omitido quando não for conhecido com confiança;
- parsing defensivo da resposta SEFAZ, DTD desabilitado e limite de 10 MiB para XML/resposta;
- validação de que o `docZip` retornado pertence exatamente à chave solicitada;
- categorias normalizadas `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable` e `technical_error`;
- tratamento de `137`, `138`, `656`, HTTP 429, timeout e falhas ambíguas sem retry automático;
- XML fiscal bruto preservado e devolvido ao site somente quando um `procNFe` válido da chave solicitada é encontrado;
- material do A1 clonado com ownership independente para cada consulta e descartado ao término do lookup;
- cliente TypeScript `lookupNfe()` restrito ao Bridge local e com validação estrita do contrato JSON;
- validação da chave NF-e também no navegador antes de qualquer chamada ao Bridge;
- pipeline XML integralmente no site com parser DOM, validação de `infNFe/@Id` contra a chave consultada e rejeição de XML malformado/mismatched;
- estado explícito `XML inválido` tanto no fluxo SEFAZ quanto no fluxo Portal;
- modelo fiscal tipado para DANFE: emitente, destinatário, itens, tributos, totais, fatura/duplicata, pagamento, transporte, adicionais, datas e protocolo;
- XML original preservado sem mutação e download liberado somente depois da validação local;
- tratamento Fernando Klein portado com catálogo oficial de 17 produtos, aliases/normalização, isolamento por emitente e preservação do `cProd` fiscal;
- DANFE aprovado portado para o site com layout A4 compacto, primeira coluna `Item`, código interno Fernando Klein apenas como apresentação, transporte somente quando útil, paginação por espaço vertical e código de barras da chave;
- preview DANFE em modal, `Ctrl + scroll` restrito ao documento, fechamento por botão/Esc/backdrop e impressão/PDF pelo navegador;
- formulário de consulta integrado ao Bridge com estados fiscais/técnicos renderizados sem injetar conteúdo retornado como HTML;
- fallback automático `consumption_limit/656 → Portal Nacional → XML → mesmo parser/DANFE`, sem repetir a consulta SEFAZ;
- `POST /api/v1/portal/start` e `GET /api/v1/portal/status/{operationId}` com operações locais e efêmeras;
- helper `NfeAgendamento.Portal.exe` em WinForms/WebView2, bloqueando navegação externa, novas janelas externas e downloads fora do endpoint XML oficial;
- seleção do certificado do Portal pelo mesmo thumbprint escolhido no site;
- XML vindo do Portal limitado a 10 MiB, validado contra a chave e entregue ao site apenas após validação;
- hCaptcha do Portal permanece obrigatoriamente manual e não existe automação/bypass;
- regressão automática que impede reintroduzir Central, pareamento, leader/standby, fila compartilhada, lote ou bind LAN;
- deploy Cloudflare pela raiz do monorepo usando `wrangler.jsonc`, com build automático do site e publicação de `apps/web/dist`;
- `npx wrangler deploy --dry-run` no CI;
- build real do helper `net10.0-windows` no CI;
- pacote Windows de aceitação gerado no CI como artifact `NfeAgendamentoBridge-win-x64`, com Bridge e helper Portal lado a lado.

## Pendência para uso real

A implementação automatizável está fechada. Antes de declarar uma release validada em produção ainda é necessário executar o **teste físico Windows** descrito em `docs/testing/acceptance.md`, incluindo:

- navegador real acessando o Bridge em loopback;
- certificado A1 real;
- consulta SEFAZ real;
- DANFE/PDF;
- ocorrência real ou controlada de limite/656 para validar WebView2 + Portal + hCaptcha manual + retorno do XML;
- segundo PC independente com seu próprio Bridge.

A origem HTTPS definitiva do site também precisa ser configurada no Bridge em `Bridge:AllowedOrigins`. O Bridge permanece fail-closed quando nenhuma origem é configurada. Consulte `docs/architecture/bridge-security.md`.

## Fora de escopo desta versão

Não existem Central, pareamento, líder/standby, servidor LAN, pasta compartilhada, login, banco, histórico ou consulta em lote.

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

O Cloudflare Workers Builds pode continuar usando o comando padrão na raiz do repositório:

```bash
npx wrangler deploy
```

O `wrangler.jsonc` da raiz executa `npm run build:web` e publica `./apps/web/dist`, evitando que o Wrangler tente fazer autodetecção no root do workspace. O CI executa também `npx wrangler deploy --dry-run` para validar essa configuração sem publicar.

## Pacote Windows para aceitação

Depois de uma execução verde do CI, o job `windows-package` gera o artifact:

```text
NfeAgendamentoBridge-win-x64
```

O artifact reúne `NfeAgendamento.Bridge.exe` e `NfeAgendamento.Portal.exe` no mesmo diretório, como exigido pelo launcher do fallback. O pacote atual é framework-dependent e requer .NET 10 Desktop Runtime; o helper também requer Microsoft Edge WebView2 Runtime.

A release `v0.0.1` é publicada pelo GitHub Actions somente depois de um CI verde e recebe esse pacote Windows como asset. As notas ficam em `docs/releases/v0.0.1.md`.

Antes de iniciar o Bridge em produção, configure a origem exata do site, por exemplo:

```powershell
$env:Bridge__AllowedOrigins__0 = "https://SEU-DOMINIO-EXATO"
.\NfeAgendamento.Bridge.exe
```

Não use wildcard na allowlist.

## Documentação

- arquitetura/segurança: `docs/architecture/bridge-security.md`;
- aceitação física: `docs/testing/acceptance.md`;
- notas da release `v0.0.1`: `docs/releases/v0.0.1.md`;
- plano técnico canônico: `docs/superpowers/plans/2026-09-08-nfe-agendamento-2-implementation.md`;
- fechamento da Task 4: `docs/superpowers/plans/2026-09-08-task-4-completion.md`;
- fechamento da Task 5: `docs/superpowers/plans/2026-09-08-task-5-completion.md`.
