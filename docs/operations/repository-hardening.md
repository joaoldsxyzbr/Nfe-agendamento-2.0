# Hardening do repositório

## Estado atual

O produto atual é site + extensão Chromium. O CI não compila nem empacota componentes Windows.

## Gates

### web

- `npm ci`;
- `npm audit --audit-level=high`;
- lint/typecheck;
- format check;
- testes e cobertura;
- build;
- `wrangler deploy --dry-run`.

### extension

- `npm ci`;
- audit;
- testes;
- typecheck/build;
- empacotamento do ZIP MV3.

### danfe-print

Executa os testes Playwright do fluxo web e regressão DANFE/PDF.

### CodeQL

Analisa JavaScript/TypeScript.

## Release

O workflow de release só roda após CI verde da `main` e commit exato `release: vX.Y.Z`. A release extension-only publica somente o ZIP da extensão validado pelo mesmo SHA.

## Cloudflare

O Worker serve assets estáticos. O tombstone `FiscalCoordinator: deleted` existe somente para reconciliar a remoção definitiva do antigo Durable Object.
