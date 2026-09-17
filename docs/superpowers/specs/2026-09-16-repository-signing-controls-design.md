# Repository and Signing Controls Design

## Objetivo

Concluir o desenho dos dois controles externos restantes do projeto — proteção administrativa da `main` e ativação de Authenticode — sem alterar a arquitetura funcional do aplicativo.

## Escopo

Esta especificação documenta configuração e validação. Ela não inclui compra de certificado, emissão de certificado, armazenamento de segredo fora dos mecanismos já previstos nem alteração das regras fiscais do aplicativo.

## Proteção da `main`

Configuração alvo no GitHub:

- ruleset `main-protection` ativo;
- alvo: branch `main`/default branch;
- bloquear exclusão da branch;
- bloquear force push;
- exigir pull request antes de merge;
- zero aprovações humanas obrigatórias é aceitável para manutenção individual;
- exigir resolução das conversas antes do merge;
- exigir branch atualizada antes do merge;
- exigir os checks `web`, `danfe-print`, `bridge`, `fiscal-compatibility` e `windows-package` do workflow `CI`;
- sem bypass normal; conta de emergência somente se o proprietário decidir explicitamente configurá-la.

Validação: abrir um PR mínimo e confirmar que o GitHub bloqueia merge enquanto um check obrigatório estiver pendente ou falhando.

A configuração depende de permissão administrativa do proprietário do repositório e não deve ser simulada por mudança no código.

## Authenticode

O pipeline existente já contém suporte condicional para assinatura de:

1. `NfeAgendamento.App.exe`;
2. `NfeAgendamento.Bridge.exe`;
3. `NfeAgendamento.Portal.exe`;
4. Setup final do Inno Setup.

A ativação depende de certificado real com EKU Code Signing e dos secrets já definidos pelo projeto:

- `CODE_SIGNING_PFX_BASE64`;
- `CODE_SIGNING_PFX_PASSWORD`.

A configuração preferida é armazenar esses secrets em GitHub Environment protegido usado pelo fluxo de publicação, preservando a regra existente de não fornecer segredos de assinatura a builds de pull request.

## Validação de Authenticode

Depois de configurado o certificado real:

- gerar uma release de teste pelo pipeline normal;
- confirmar que App, Bridge, Portal e Setup estão assinados;
- executar `signtool verify /pa` nos quatro artefatos;
- confirmar timestamp RFC 3161 e SHA-256;
- confirmar que builds de pull request continuam sem receber os secrets;
- atualizar `docs/testing/acceptance.md`, `docs/operations/repository-hardening.md` e README com o estado real.

## Critérios de aceite

A proteção da `main` só é considerada concluída depois de teste real de bloqueio de merge.

Authenticode só é considerado concluído depois que uma release produzida pelo CI contiver assinaturas verificáveis nos quatro artefatos. A existência do script/pipeline preparado não é suficiente para marcar esse item como concluído.

## Não objetivos

- alterar a ferramenta de empacotamento;
- criar updater automático;
- permitir segredo de assinatura em pull request;
- commitar PFX, Base64, senha ou chave privada;
- substituir os gates técnicos do CI.
