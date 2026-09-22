# Task 9 — UX final, documentação e readiness

Data: 08/09/2026

## Status

**Readiness automatizada implementada.** A release ainda depende da aceitação física Windows/A1/SEFAZ/Portal registrada em `docs/testing/acceptance.md`.

## UX final

A interface distingue explicitamente:

- Bridge não encontrado;
- permissão de acesso local necessária;
- certificado A1 ausente/indisponível;
- chave inválida;
- resultado fiscal sem XML;
- limite de consumo/656;
- SEFAZ indisponível;
- Portal indisponível;
- Portal cancelado;
- XML inválido.

## Regressão arquitetural

`apps/web/tests/readiness.test.ts` varre o código ativo e impede reintroduzir conceitos removidos da versão 2.0, incluindo:

- pairing/pareamento;
- leader election;
- standby;
- shared queue;
- batch lookup;
- `--lan`;
- bind `0.0.0.0:17345`.

A versão ativa permanece site + Bridge local por PC, sem Central.

## Segurança e aceitação

Criados:

- `docs/architecture/bridge-security.md` — fronteira de confiança, Origin/Host, A1, SEFAZ, WebView2 e checklist de produção;
- `docs/testing/acceptance.md` — roteiro físico para navegadores, A1, SEFAZ, DANFE/PDF, Portal/656 e segundo PC independente.

## CI e pacote Windows

O CI valida:

- testes web;
- build Vite/TypeScript;
- `wrangler deploy --dry-run`;
- testes xUnit do Bridge;
- build Release do Bridge;
- build do helper Windows/WebView2;
- publish em Windows real (`windows-latest`) de Bridge + helper no mesmo diretório;
- upload do artifact `NfeAgendamentoBridge-win-x64`.

O run `34253612041`, commit `91a7fdd42ec6e40b20fb2e8b67830e9bcfa37046`, concluiu os três jobs (`web`, `bridge`, `windows-package`) com sucesso e gerou o artifact `NfeAgendamentoBridge-win-x64`.

## O que o CI não comprova

Ainda precisam de validação física:

- comportamento de permissão de loopback dos navegadores no ambiente do usuário;
- certificado A1 real instalado no Windows;
- resposta real da SEFAZ;
- impressão/PDF visual final no ambiente do usuário;
- WebView2 interagindo com o Portal Nacional atual;
- hCaptcha manual;
- seleção do certificado no Portal;
- download real do XML do Portal;
- fluxo em segundo PC independente.

## Configuração de produção pendente

Antes do teste físico, definir a origem HTTPS exata do site em `Bridge:AllowedOrigins`. Não existe wildcard e o Bridge permanece fail-closed sem origem permitida.

Exemplo:

```powershell
$env:Bridge__AllowedOrigins__0 = "https://SEU-DOMINIO-EXATO"
.\NfeAgendamento.Bridge.exe
```

A URL não deve ser adivinhada nem ampliada; usar somente a origem real do deployment Cloudflare.

## Critério para release

Só considerar a release validada para uso real quando:

1. CI do commit final estiver completamente verde;
2. artifact Windows correspondente existir;
3. checklist físico tiver os cenários essenciais aprovados;
4. a origem de produção estiver configurada corretamente;
5. qualquer divergência encontrada no teste físico tiver sido corrigida e revalidada.
