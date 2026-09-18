# Hardening do repositório e da distribuição

Estado: implementado no código/pipeline e revisado em 18/09/2026, exceto controles que dependem de administração externa do GitHub ou de certificado real de assinatura.

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

## Authenticode

O workflow está preparado para assinar, nesta ordem:

1. `NfeAgendamento.App.exe`;
2. `NfeAgendamento.Bridge.exe`;
3. `NfeAgendamento.Portal.exe`;
4. o Setup final gerado pelo Inno Setup.

A assinatura só é ativada quando os dois secrets abaixo existirem no repositório:

- `CODE_SIGNING_PFX_BASE64`: PFX de code signing codificado integralmente em Base64;
- `CODE_SIGNING_PFX_PASSWORD`: senha do PFX.

Nunca commitar PFX, senha ou Base64 do certificado.

As etapas que recebem esses secrets têm condição explícita para executar **somente em `push` para `refs/heads/main`**. Builds de `pull_request` continuam compilando e empacotando, mas não recebem nem executam o caminho de assinatura.

O script `scripts/sign-windows-artifacts.ps1`:

- não falha o build quando nenhum secret de assinatura foi configurado;
- falha de forma explícita se apenas um dos dois secrets estiver presente;
- importa o PFX temporariamente no store `CurrentUser/My` como não exportável;
- exige chave privada e EKU `1.3.6.1.5.5.7.3.3` (Code Signing);
- usa SHA-256 para digest e timestamp RFC 3161;
- verifica cada assinatura com `signtool verify /pa`;
- remove o certificado importado e o PFX temporário no `finally`.

Em 18/09/2026 não foi fornecido ao projeto um certificado real de code signing nem acesso aos secrets do repositório. Portanto, não é correto declarar Authenticode como concluído. O código/pipeline está pronto; a etapa restante é externa. Quando houver certificado real, a configuração preferível é associar os secrets a um GitHub Environment protegido usado pelo fluxo de publicação.

Além da assinatura opcional do CI comum, a `main` atual possui dois gates adicionais:

- `UpdateService` só promove/abre um Setup depois de SHA-256 **e** `WinVerifyTrust` aprovarem a assinatura Authenticode;
- commits `release: vX.Y.Z` exigem `Get-AuthenticodeSignature` com estado `Valid` para App, Bridge, Portal e Setup. Sem isso, `windows-package` falha e o workflow de release não publica a versão.

## Proteção da `main`

Em 18/09/2026 a consulta de rulesets do repositório continua retornando lista vazia; a `main` permanece sem ruleset moderno ativo.

A integração usada pelo projeto não possui permissão administrativa de escrita para criar esse controle automaticamente. Portanto, não é possível concluir esse item a partir deste ambiente sem ação do proprietário no GitHub.

Configuração recomendada no GitHub para o ruleset `main-protection`:

- alvo: default branch / `main`;
- enforcement: `Active`;
- bloquear exclusão da branch;
- bloquear force push;
- exigir pull request antes de merge;
- para repositório mantido por uma pessoa, `0` aprovações obrigatórias é aceitável, mantendo o PR como gate técnico;
- exigir resolução de conversas antes do merge;
- exigir status checks antes do merge;
- checks obrigatórios: `web`, `danfe-print`, `bridge`, `fiscal-compatibility` e `windows-package` do workflow `CI`;
- exigir branch atualizada antes do merge;
- não permitir bypass, salvo conta de emergência explicitamente definida pelo proprietário.

Depois de habilitar o ruleset, validar com um PR pequeno que o GitHub realmente bloqueia merge enquanto qualquer job obrigatório estiver pendente ou falhando.

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
