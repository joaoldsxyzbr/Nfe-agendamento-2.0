# Hardening do repositório e da distribuição

Estado: implementado no código/pipeline e revisado em 18/09/2026. Authenticode e ruleset/branch protection são controles opcionais e não compõem o critério de conclusão deste projeto.

## CI e cadeia de build

O CI segue estas regras:

- GitHub Actions de terceiros são referenciadas por SHA imutável de 40 caracteres, mantendo a major correspondente apenas como comentário;
- `persist-credentials: false` é usado no checkout;
- o workflow de CI possui somente `contents: read`;
- runners são explícitos (`ubuntu-24.04` e `windows-2025`);
- jobs possuem timeout;
- Wrangler é executado a partir da dependência instalada pelo lockfile, sem fallback de download pelo `npx`;
- Inno Setup é fixado em `6.7.1`, instalado da fonte oficial do Chocolatey com verificação de checksum obrigatória e versão conferida antes do build;
- Playwright fica isolado em `tests/playwright`, com versão/lockfile fixos; o job `danfe-print` gera PDFs A4 reais e executa também um fluxo de navegador da consulta unitária com Bridge interceptado;
- o job `web` mede cobertura V8 do frontend/Worker e mantém o resumo no log do CI, sem impor um percentual arbitrário como substituto de testes comportamentais;
- o job `fiscal-compatibility` executa o POC fiscal do `Unimake.DFe` antes de liberar o empacotamento Windows;
- `windows-package` depende de `web`, `danfe-print`, `bridge` e `fiscal-compatibility`;
- artifacts de release continuam vindo exclusivamente do mesmo CI verde que validou o commit;
- o workflow CodeQL também referencia `github/codeql-action` por SHA imutável, mantendo `v4` somente como comentário.

Os testes estáticos de workflow e os próprios jobs do CI impedem regressões acidentais nesses contratos.

## Arquivos sensíveis

O `.gitignore` bloqueia preventivamente, além de arquivos de ambiente:

- `*.pfx`;
- `*.p12`;
- `*.pem`;
- `*.key`.

Isso não substitui secret scanning nem revisão de commits, mas reduz o risco de inclusão acidental de material criptográfico no repositório.

## Authenticode opcional

O pipeline mantém suporte opcional à assinatura de:

1. `NfeAgendamento.Bridge.exe`;
2. `NfeAgendamento.Portal.exe`;
3. Setup final do Inno Setup.

Quando `CODE_SIGNING_PFX_BASE64` e `CODE_SIGNING_PFX_PASSWORD` estiverem configurados, `scripts/sign-windows-artifacts.ps1` assina e verifica os artefatos. Quando os dois secrets estiverem ausentes, o script encerra com sucesso e os artefatos permanecem sem assinatura.

A ausência de Authenticode **não bloqueia CI, updater nem release**. O updater mantém as proteções obrigatórias de origem esperada, nome/versionamento do asset, tamanho publicado e SHA-256. Configuração Authenticode parcial continua falhando de forma explícita para evitar uma assinatura mal configurada.

## Proteção da `main` opcional

O repositório não possui ruleset ativo na `main`. Por decisão do projeto em 18/09/2026, branch protection/ruleset não é requisito de conclusão nem de release. O CI e o CodeQL continuam executando em pushes para a `main`, mas não existe gate administrativo adicional exigido pelo projeto.

## Portal Nacional

As decisões sensíveis do helper WebView2 foram concentradas em `PortalSecurityPolicy` e passam por testes comportamentais para:

- HTTPS obrigatório;
- host oficial exato;
- página de consulta esperada;
- endpoint oficial de download XML;
- contexto temporal e origem do diálogo de confirmação;
- conteúdo mínimo esperado da confirmação;
- nome aleatório do XML temporário.

O nome do arquivo temporário usa somente GUID e extensão `.xml`; a chave NF-e não é colocada no nome do arquivo. A chave continua sendo validada dentro do XML antes de o conteúdo ser aceito. Na inicialização do helper, arquivos `.xml` com mais de 24 horas no diretório temporário dedicado são removidos para evitar retenção após encerramento abrupto.

Os testes estáticos do WebView2 permanecem apenas onde são úteis para garantir o wiring dos eventos e que não foi introduzida automação de captcha. A interação real com Portal Nacional, hCaptcha, A1 e SEFAZ continua exigindo a validação física descrita em `docs/testing/acceptance.md`.
