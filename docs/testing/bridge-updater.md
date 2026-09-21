# Atualização do componente Windows — site-first

## Objetivo

O site oficial é a interface normal para diagnosticar e atualizar o componente Windows. Na transição da Release B, `NfeAgendamento.App.exe` continua empacotado como supervisor/rollback, mas roda headless: não exibe bandeja, menu de atualização, duplo clique ou abertura automática do site.

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

## Supervisor de transição

Na Release B:

- `NfeAgendamento.App.exe` continua no pacote;
- o modo padrão do instalador ainda pode usar o App como supervisor do Bridge gerenciado;
- o App não expõe menu, `NotifyIcon` visível ou ação de atualização;
- `UpdateService.cs` e seus testes permanecem temporariamente no código para preservar rollback e histórico de segurança até o gate final;
- o piloto `BridgeAutostartMode=standalone` pode iniciar o Bridge diretamente, conforme `docs/testing/standalone-bridge.md`.

A remoção física do updater/App pertence à Task 8 e só pode ocorrer após uma release de transição estável.

## Falhas

Falhas de metadata/download no site devem resultar em mensagem de atualização indisponível sem alterar o estado do Bridge. Falhas de instalação são tratadas pelo próprio Setup/Windows; o site deve voltar a diagnosticar o componente quando ele estiver disponível.

## Testes automatizados

- `windows-update.test.ts`: comparação de versão e validação estrita da metadata consumida pelo site.
- `update-proxy-worker.test.ts`: reescrita/cache da metadata, rate limit por IP, streaming do Setup exato, rejeição de caminho arbitrário e falha upstream.
- `UpdateReleaseParserTests.cs` e `UpdateServiceTests.cs`: mantidos durante a release de transição para o código de rollback ainda empacotado.
- `TrayUpdaterStaticTests.cs` e `TrayAppStaticTests.cs`: provam que o supervisor de transição não oferece UI paralela e preserva o lifecycle do Bridge.
- `InstallerStaticTests.cs`: prova o modo padrão e o piloto standalone.

## Teste físico da Release B

- instalar a versão pública anterior e abrir o site;
- confirmar que a atualização é apresentada pelo painel do site, não pelo App;
- confirmar download pelo domínio `nfeagendamento.joaolds.xyz.br`;
- concluir o Setup e confirmar preservação de `%LOCALAPPDATA%\\NfeAgendamentoBridge`;
- confirmar versão nova no diagnóstico do site;
- confirmar que o supervisor de transição não cria ícone/menu visível;
- para o piloto standalone, executar adicionalmente `docs/testing/standalone-bridge.md`.
