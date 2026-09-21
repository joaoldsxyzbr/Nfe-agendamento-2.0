# Atualização do componente Windows — site-first

## Objetivo

O site oficial é a única interface para diagnosticar e descobrir atualizações do componente Windows. Desde a v0.0.20, o pacote não contém `NfeAgendamento.App.exe`; o Bridge standalone é iniciado diretamente pelo Windows.

A atualização nunca é instalada silenciosamente. O site apenas apresenta o Setup oficial quando existe versão estável mais nova; o usuário decide baixar e executar o instalador.

## Fonte da atualização

O site consulta:

`https://nfeagendamento.joaolds.xyz.br/api/update/latest`

O Worker consulta server-side a release estável mais recente de `joaoldsxyzbr/Nfe-agendamento-2.0`, rejeita rascunhos/pré-releases e devolve somente a metadata necessária. A metadata validada usa cache curto no edge e as rotas de atualização possuem rate limiter próprio por IP.

Para uma release `vX.Y.Z`, o fluxo aceita somente:

`NFeAgendamentoBridge-Setup-vX.Y.Z.exe`

e somente a rota HTTPS:

`https://nfeagendamento.joaolds.xyz.br/downloads/windows/vX.Y.Z/NFeAgendamentoBridge-Setup-vX.Y.Z.exe`

O Worker constrói internamente a URL fixa do GitHub para esse asset e faz streaming da resposta. Não há proxy genérico nem entrada de URL/host arbitrário.

## Validações da metadata

Antes de o site oferecer a atualização, o contrato exige:

1. versão semver válida e maior que a versão do Bridge informada por `GET /api/v1/health`;
2. release estável, sem draft/prerelease;
3. asset no estado `uploaded`;
4. nome exato do Setup versionado;
5. tamanho positivo;
6. digest no formato `sha256:<64 caracteres hexadecimais>`;
7. URL reescrita para a rota versionada do domínio oficial.

O navegador não substitui um verificador de assinatura/hash do arquivo já baixado. A proteção do fluxo web está na seleção estrita da release/asset pelo Worker e na rota de download fechada. Authenticode continua opcional no projeto.

## Fluxo normal de usuário

1. Abrir o site oficial.
2. Abrir **Configurações**.
3. O site lê a versão do Bridge por `GET /api/v1/health`.
4. O site consulta `GET /api/update/latest`.
5. Se houver versão maior, aparece **Atualizar componente Windows para X.Y.Z**.
6. O link baixa o Setup pela rota versionada do próprio domínio.
7. O usuário executa o Setup e conclui a instalação.
8. Após o Bridge voltar, o diagnóstico confirma a versão instalada.

A falha da metadata de update é best-effort: não transforma um Bridge saudável em indisponível.

## Lifecycle Windows final

Desde a v0.0.20:

- o Setup inicia `NfeAgendamento.Bridge.exe` diretamente;
- o antigo App supervisor e `UpdateService.cs` foram removidos;
- não existe fluxo paralelo de atualização no Windows;
- o site continua apresentando somente o Setup oficial versionado;
- o usuário continua decidindo quando executar o instalador.

## Falhas

Falhas de metadata/download no site devem resultar em mensagem de atualização indisponível sem alterar o estado do Bridge. Falhas de instalação são tratadas pelo próprio Setup/Windows; o site deve voltar a diagnosticar o componente quando ele estiver disponível.

## Testes automatizados

- `windows-update.test.ts`: comparação de versão e validação estrita da metadata consumida pelo site.
- `update-proxy-worker.test.ts`: reescrita/cache da metadata, rate limit por IP, streaming do Setup exato, rejeição de caminho arbitrário e falha upstream.
- `InstallerStaticTests.cs` e `WindowsLifecycleStaticTests.cs`: provam o lifecycle standalone final, ausência do App e empacotamento Bridge + Portal.

## Teste físico da Release C

- instalar a versão pública anterior e abrir o site;
- confirmar que a atualização é apresentada pelo painel do site, não pelo App;
- confirmar download pelo domínio `nfeagendamento.joaolds.xyz.br`;
- concluir o Setup e confirmar preservação de `%LOCALAPPDATA%\\NfeAgendamentoBridge`;
- confirmar versão nova no diagnóstico do site;
- confirmar ausência de `NfeAgendamento.App.exe` e início do Bridge sem console;
- para o piloto standalone, executar adicionalmente `docs/testing/standalone-bridge.md`.
