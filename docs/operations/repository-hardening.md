# Hardening do repositório e da distribuição

Estado: implementado no código/pipeline em 11/09/2026, exceto controles que dependem de administração externa do GitHub ou de certificado de assinatura.

## CI e cadeia de build

O CI segue estas regras:

- GitHub Actions de terceiros são referenciadas por SHA imutável de 40 caracteres, mantendo a major correspondente apenas como comentário;
- `persist-credentials: false` é usado no checkout;
- o workflow de CI possui somente `contents: read`;
- runners são explícitos (`ubuntu-24.04` e `windows-2025`);
- jobs possuem timeout;
- Wrangler é executado a partir da dependência instalada pelo lockfile, sem fallback de download pelo `npx`;
- Inno Setup é fixado em `6.7.1`, instalado da fonte oficial do Chocolatey com verificação de checksum obrigatória e versão conferida antes do build;
- artifacts de release continuam vindo exclusivamente do mesmo CI verde que validou o commit.

Os testes `WorkflowHardeningStaticTests` impedem regressões acidentais nesses contratos.

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

O script `scripts/sign-windows-artifacts.ps1`:

- não falha o build quando nenhum secret de assinatura foi configurado;
- falha de forma explícita se apenas um dos dois secrets estiver presente;
- importa o PFX temporariamente no store `CurrentUser/My` como não exportável;
- exige chave privada e EKU `1.3.6.1.5.5.7.3.3` (Code Signing);
- usa SHA-256 para digest e timestamp RFC 3161;
- verifica cada assinatura com `signtool verify /pa`;
- remove o certificado importado e o PFX temporário no `finally`.

Enquanto não houver um certificado de code signing real, os binários continuam sem publisher Authenticode. Isso é uma dependência externa, não uma falha silenciosa do pipeline.

## Proteção da `main`

Em 11/09/2026 o repositório não possui GitHub Ruleset moderno configurado. A integração usada pelo projeto não possui permissão administrativa de escrita para criar esse controle automaticamente.

Configuração recomendada no GitHub para o ruleset `main-protection`:

- alvo: default branch / `main`;
- enforcement: `Active`;
- bloquear exclusão da branch;
- bloquear force push;
- exigir pull request antes de merge;
- para repositório mantido por uma pessoa, `0` aprovações obrigatórias é aceitável, mantendo o PR como gate técnico;
- exigir resolução de conversas antes do merge;
- exigir status checks antes do merge;
- checks obrigatórios: `web`, `bridge` e `windows-package` do workflow `CI`;
- exigir branch atualizada antes do merge;
- não permitir bypass, salvo conta de emergência explicitamente definida pelo proprietário.

Depois de habilitar o ruleset, validar com um PR pequeno que o GitHub realmente bloqueia merge enquanto qualquer um dos três jobs estiver pendente ou falhando.

## Portal Nacional

As decisões sensíveis do helper WebView2 foram concentradas em `PortalSecurityPolicy` e passaram a ter testes comportamentais para:

- HTTPS obrigatório;
- host oficial exato;
- página de consulta esperada;
- endpoint oficial de download XML;
- contexto temporal e origem do diálogo de confirmação;
- conteúdo mínimo esperado da confirmação;
- nome aleatório do XML temporário.

O nome do arquivo temporário agora usa somente GUID e extensão `.xml`; a chave NF-e não é mais colocada no nome do arquivo. A chave continua sendo validada dentro do XML antes de o conteúdo ser aceito.

Os testes estáticos do WebView2 permanecem apenas onde são úteis para garantir o wiring dos eventos e que não foi introduzida automação de captcha. A interação real com Portal Nacional, hCaptcha, A1 e SEFAZ continua exigindo a validação física descrita em `docs/testing/acceptance.md`.
