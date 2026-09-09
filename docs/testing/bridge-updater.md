# Atualizador manual do App/Bridge

## Objetivo

O `NfeAgendamento.App.exe` oferece a ação **Verificar atualizações** no menu da bandeja do Windows. A atualização nunca é instalada silenciosamente: o usuário precisa iniciar a verificação e confirmar a instalação de uma versão mais nova.

## Fonte da atualização

O App consulta somente a release estável mais recente do repositório oficial:

`joaoldsxyzbr/Nfe-agendamento-2.0`

O updater ignora releases em rascunho e pré-releases. A versão instalada é obtida do próprio assembly do `NfeAgendamento.App.exe`.

Para uma release `vX.Y.Z`, o updater aceita somente o asset com nome exato:

`NFeAgendamentoBridge-Setup-vX.Y.Z.exe`

A URL do asset precisa ser HTTPS, no host `github.com`, e apontar exatamente para o caminho de download da release esperada nesse repositório.

## Verificações antes de executar

O instalador somente é liberado para execução depois de todas estas verificações:

1. versão da release maior que a versão instalada;
2. asset no estado `uploaded`;
3. tamanho publicado positivo e menor ou igual a 256 MiB;
4. tamanho efetivamente baixado igual ao tamanho publicado pela release;
5. digest da release no formato `sha256:<64 caracteres hexadecimais>`;
6. SHA-256 calculado localmente igual ao digest publicado pelo GitHub.

O download é escrito primeiro como arquivo `.download`. Em erro de rede, tamanho ou hash, o arquivo parcial/final é removido e nenhum instalador é iniciado.

## Fluxo de usuário

1. Clicar com o botão direito no ícone do NFe Agendamento na bandeja.
2. Selecionar **Verificar atualizações**.
3. Se a versão instalada já for a mais recente, o App apenas informa isso.
4. Se houver versão mais nova, o App mostra versão instalada e nova versão e pergunta se deseja continuar.
5. Somente após **Sim**, o instalador é baixado e verificado.
6. Depois da validação, o App inicia o Setup oficial.
7. O App encerra a si mesmo e o Bridge local para permitir que o instalador substitua os arquivos.
8. O instalador continua sendo interativo; não há argumentos de instalação silenciosa.

## Falhas

Falhas HTTP, timeout, erro de disco, asset inesperado, tamanho divergente, hash divergente ou falha ao iniciar o Setup são exibidas ao usuário. Nesses casos o App/Bridge permanece em execução e pode ser usado normalmente.

## Testes automatizados

- `UpdateReleaseParserTests.cs`: versão, asset exato, origem da URL e exigência de SHA-256.
- `UpdateServiceTests.cs`: tamanho e SHA-256 do download, incluindo limpeza em falha.
- `TrayUpdaterStaticTests.cs`: presença do fluxo manual no app de bandeja.

O CI também recompila o `NfeAgendamento.App`, o Bridge e o helper Portal e gera o pacote Windows após os jobs web/bridge ficarem verdes.

## Teste físico Windows

Ao publicar uma versão posterior à instalada:

- confirmar que **Verificar atualizações** detecta a versão nova;
- clicar **Não** e confirmar que nada é baixado/instalado;
- repetir, clicar **Sim** e confirmar o download;
- confirmar que o Setup só abre depois da verificação SHA-256;
- confirmar que App/Bridge fecham para a instalação;
- concluir o Setup e confirmar que o novo App inicia normalmente;
- usar **Verificar atualizações** novamente e confirmar a mensagem de versão mais recente.
