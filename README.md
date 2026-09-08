# NFe Agendamento 2.0

Reescrita limpa do NFe Agendamento com **site estático + Bridge Windows mínimo**.

## Arquitetura atual

- **Site:** Vite + TypeScript; concentra interface, parsing XML, DANFE e regras de apresentação.
- **Bridge:** ASP.NET Core .NET 10 em `http://127.0.0.1:17345` somente.
- **API local:** `/api/v1`.
- **Segurança:** Host estrito `127.0.0.1:17345`, allowlist de `Origin`, CORS sem wildcard e produção fail-closed sem origem configurada.
- **Certificado A1:** descoberto em `CurrentUser/My`; a chave privada nunca sai do Windows/Bridge.
- **Persistência:** somente o thumbprint selecionado em `%LOCALAPPDATA%/NfeAgendamentoBridge/settings.json`.

## Estado funcional — 08/09/2026

Concluído e validado no CI:

- bootstrap Vite/TypeScript e .NET 10;
- build e testes web + Bridge;
- `GET /api/v1/health`;
- detecção do Bridge pelo site;
- proteção de `Origin`/`Host` com testes de integração;
- `GET /api/v1/certificates`;
- `POST /api/v1/certificate/select`;
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
- cliente TypeScript `lookupNfe()` restrito ao Bridge local e com validação estrita do contrato JSON.

Em implementação:

- pipeline XML no navegador;
- regra Fernando Klein;
- DANFE;
- fallback Portal/WebView2.

## Fora de escopo desta versão

Não existem Central, pareamento, líder/standby, servidor LAN, pasta compartilhada, login, banco, histórico ou consulta em lote.

## Desenvolvimento

```bash
npm install
npm run test:web
npm run build:web

dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release
```

O plano técnico canônico está em `docs/superpowers/plans/2026-09-08-nfe-agendamento-2-implementation.md`.
O fechamento da Task 4 está registrado em `docs/superpowers/plans/2026-09-08-task-4-completion.md`.
