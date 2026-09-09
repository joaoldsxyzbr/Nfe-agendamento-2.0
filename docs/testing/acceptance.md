# Aceitação física — NFe Agendamento 2.0

Este checklist cobre o que o CI não consegue provar: instalação real no Windows, app na bandeja, lifecycle App/Bridge, navegador falando com loopback, certificado A1, SEFAZ, WebView2, Portal Nacional, captcha, impressão/PDF e atualização.

> Não provoque bloqueio/656 fazendo consultas repetidas. Valide o fallback quando o limite ocorrer naturalmente ou em cenário controlado já disponível.

## Pré-requisitos

- Windows 10/11 x64 atualizado;
- Setup produzido pelo **mesmo commit CI** que será validado;
- Microsoft Edge WebView2 Runtime instalado para testar o fallback Portal;
- certificado A1 válido instalado em `CurrentUser/My` com chave privada;
- site oficial disponível exatamente em `https://nfeagendamento.joaolds.xyz.br`;
- acesso à Internet para SEFAZ, GitHub Releases e Portal Nacional da NF-e.

A versão canônica continua `0.0.6`, mas existem commits de estabilização posteriores à release pública `v0.0.6`. Portanto, ao validar código pós-release, use o artifact de Actions do SHA em teste e registre esse SHA; não assuma que ele é idêntico ao binário da release `v0.0.6`.

> O publish é self-contained: não exige instalação prévia do .NET 10. O WebView2 Runtime continua necessário somente para o fallback Portal.

> Os artifacts atuais **não possuem Authenticode**. Este checklist valida funcionamento, não identidade criptográfica de publisher.

Registre antes de começar:

| Campo | Valor |
| --- | --- |
| Data | |
| Commit SHA | |
| Versão canônica | |
| Run CI / artifact | |
| URL do site | `https://nfeagendamento.joaolds.xyz.br` |
| Windows | |
| Navegador + versão | |
| PC | |

## 0. Instalação, bandeja, instância única e auto-start

1. Execute o Setup correspondente ao SHA em teste em conta de usuário comum.
2. Confirme que a instalação **não solicita UAC/admin**.
3. Confirme que o Setup **não pede URL/origem**.
4. Confirme os arquivos em `%LOCALAPPDATA%\NFe Agendamento Bridge`.
5. Confirme `NfeAgendamento.App.exe`, `NfeAgendamento.Bridge.exe` e `NfeAgendamento.Portal.exe` lado a lado.
6. Confirme o atalho **NFe Agendamento** no Menu Iniciar e o ícone próprio.
7. Conclua a instalação com início marcado e confirme que **nenhuma janela preta de console permanece aberta**.
8. Confirme o ícone do NFe Agendamento na bandeja e estado ativo.
9. Abra o menu e confirme **Abrir NFe Agendamento**, **Verificar atualizações** e **Sair**.
10. Dê duplo clique e confirme abertura de `https://nfeagendamento.joaolds.xyz.br`.
11. Confirme auto-start em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, sem parâmetros de origem.
12. Abra novamente o atalho e confirme que não surge uma segunda bandeja nem listener concorrente.
13. Confirme uma instância do App e uma do Bridge para a sessão do usuário.
14. Use **Sair** e confirme que o ícone desaparece e o Bridge gerenciado é encerrado.
15. Abra novamente o App e confirme retorno normal sem console.
16. Reinicie sessão/PC e confirme início automático único.

Resultado: ☐ aprovado

## 1. Lifecycle, lease e recuperação do Bridge

Esta etapa valida o comportamento que o CI cobre por testes, mas que precisa ser visto em Windows real.

1. Com App + Bridge ativos, finalize **somente** `NfeAgendamento.Bridge.exe` pelo Gerenciador de Tarefas.
2. Confirme que o tray deixa de indicar estado ativo e entra em reconexão.
3. Confirme reinício automático do Bridge após o backoff e retorno do tray ao estado ativo.
4. Repita a queda de forma controlada algumas vezes em sequência e confirme que o App não entra em restart-loop infinito; ao exceder o limite, deve indicar **Bridge indisponível**.
5. Feche/reabra o App para iniciar um novo ciclo e confirme recuperação normal.
6. Com uma instância gerenciada válida já existente, abra o App novamente e confirme que ele não mata o Bridge nem cria outro listener; a instância legítima permanece preservada/adotada conforme o estado do lease.
7. Use **Sair** e confirme shutdown do Bridge controlado.
8. Se houver outro processo estranho com nome semelhante, confirme que ele não é encerrado pelo App.

Resultado: ☐ aprovado

## 2. Bridge HTTP, Origin oficial e permissão local

Executar separadamente em **Chrome, Edge e Firefox** quando disponíveis.

1. Confirme App/Bridge ativos.
2. Abra `https://nfeagendamento.joaolds.xyz.br`.
3. Se o navegador pedir acesso à rede/local host, autorize.
4. Confirme `Bridge conectado`.
5. Negue/revogque a permissão uma vez e confirme `Permissão de acesso local necessária` quando o navegador expuser essa distinção.
6. Use **Sair** e confirme `Bridge não encontrado`.
7. Reinicie pelo atalho e confirme que volta a conectar sem configurar origem.
8. Em uma origem diferente, confirme rejeição da chamada ao Bridge.
9. Confirme, quando possível com ferramenta de rede local, que a escuta permanece apenas em `127.0.0.1:17345`.

Resultado:

| Navegador | Conectou | Permissão local tratada | Bridge ausente tratado | Observações |
| --- | --- | --- | --- | --- |
| Chrome | ☐ | ☐ | ☐ | |
| Edge | ☐ | ☐ | ☐ | |
| Firefox | ☐ | ☐ | ☐ | |

## 3. Certificado A1

1. Confirme que o site lista somente certificados utilizáveis.
2. Selecione o A1 correto.
3. Recarregue a página.
4. Confirme persistência pelo thumbprint.
5. Confirme que nenhum PFX, senha ou chave privada aparece nas respostas de rede.
6. Se houver certificado vencido no PC de teste, confirme que não é oferecido como utilizável.

Resultado: ☐ aprovado

## 4. Validação da chave

1. Menos de 44 dígitos: `Chave inválida`, sem consulta fiscal.
2. Caracteres não numéricos: rejeitar.
3. DV incorreto: rejeitar.
4. Chave válida conhecida: aceitar.

Resultado: ☐ aprovado

## 5. Consulta SEFAZ normal

Com NF-e conhecida e autorizada para o certificado:

1. Clique em `Consultar` uma única vez.
2. Confirme que a consulta pode aguardar a resposta fiscal sem ser confundida com health timeout.
3. Confirme retorno sem retry perceptível.
4. Confira número, série e emitente.
5. Baixe o XML e compare `infNFe/@Id` com a chave consultada.
6. Confirme que o XML original não foi alterado pelo tratamento Fernando Klein.

Resultado: ☐ aprovado

## 6. DANFE

1. Clique em `Visualizar DANFE`.
2. Confira emitente, destinatário, chave, protocolo, itens, totais e informações adicionais contra o XML.
3. Para Fernando Klein, confira o código interno somente na apresentação e preserve `cProd` no XML.
4. Verifique coluna inicial `Item` e contagem/ordem.
5. Use `Ctrl + scroll`: somente o DANFE deve receber zoom.
6. Feche por botão, `Esc` e backdrop.
7. Use `Imprimir / PDF` e confira A4/paginação.
8. Confirme que transporte/volumes não aparece sem conteúdo útil.

Resultado: ☐ aprovado

## 7. Estados fiscais e indisponibilidade

Quando houver casos reais/controlados, confirme:

- `Resultado fiscal` para retorno sem XML;
- `SEFAZ indisponível` para indisponibilidade de transporte;
- `Certificado A1 indisponível` quando não houver A1 selecionado/utilizável;
- `XML inválido` quando XML não corresponder à chave.

Resultado: ☐ aprovado

## 8. WebView2 Runtime e fallback 656 / Portal

Antes do cenário de limite:

1. Com WebView2 Runtime instalado, confirme `webView2Available=true` sem abrir janela durante health.
2. Se houver ambiente sem Runtime, confirme `webView2Available=false` sem abrir janela apenas para detectar ausência.

Somente quando houver limite natural/controlado:

3. `consumption_limit` deve iniciar fallback sem repetir `NFeDistribuicaoDFe`.
4. Confirme abertura da janela Portal somente após o limite.
5. Confirme chave pré-preenchida.
6. Resolva **hCaptcha manualmente**.
7. Faça a consulta no Portal.
8. Quando solicitado, confirme o mesmo A1 selecionado no site.
9. Baixe XML pelo fluxo oficial.
10. Confirme retorno ao Bridge/site usando o mesmo parser/DANFE.
11. Confirme chave do XML.
12. Faça uma segunda ocorrência controlada na mesma sessão e confirme reutilização do helper/WebView2.
13. Feche a janela antes do fim e confirme `Consulta pelo Portal cancelada`.
14. Inicie nova ocorrência após o cancelamento e confirme que o helper aceita nova sessão normalmente.
15. Durante uma operação ativa, recarregue/feche a página e confirme que a operação não permanece indefinidamente presa; uma nova tentativa posterior deve funcionar.
16. Se for possível induzir desconexão do helper de forma controlada, confirme falha rápida, cooldown curto e recuperação posterior sem restart-loop.

Resultado: ☐ aprovado

## 9. Bloqueios do helper WebView2

Durante o teste do Portal:

- navegação externa deve ser bloqueada;
- nova janela externa deve ser bloqueada;
- download fora do endpoint XML oficial deve ser bloqueado;
- não deve existir automação de captcha;
- o pacote instalado deve conter WebView2 **Core + WinForms** e não depender de `Microsoft.Web.WebView2.Wpf.dll`.

Resultado: ☐ aprovado

## 10. Atualizador manual

A validação completa de instalação de atualização exige uma release estável **posterior** à versão instalada.

1. Clique em **Verificar atualizações**.
2. Se a instalada for a mais recente, confirme mensagem de atualizado.
3. Com versão posterior, confirme exibição da versão e pedido de confirmação.
4. Confirme que asset/tamanho/SHA-256 inválidos impedem execução.
5. Após confirmação válida, confirme que Setup inicia e App/Bridge encerram para substituição.

Detalhes: `docs/testing/bridge-updater.md`.

Resultado: ☐ aprovado

## 11. Desinstalação e persistência local

1. Anote `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json`, se existir.
2. Desinstale pelo Windows.
3. Confirme remoção do diretório do aplicativo, atalho e auto-start.
4. Confirme preservação de `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json` quando já existia.

Resultado: ☐ aprovado

## 12. Segundo PC independente

1. Instale o mesmo Setup validado.
2. Confirme ausência de URL/origem e início na bandeja sem console.
3. Use o A1 instalado **nesse segundo PC**.
4. Abra o site oficial.
5. Faça consulta normal.

Confirme ausência de Central, pareamento, pasta compartilhada ou dependência do primeiro PC.

Resultado: ☐ aprovado

## 13. Hardening externo

Registrar separadamente, porque não é coberto pelo teste funcional do binário:

| Controle | Estado | Evidência |
| --- | --- | --- |
| Authenticode App/Bridge/Portal/Setup | ☐ configurado / ☐ pendente | |
| Proteção da `main` + required CI checks | ☐ configurado / ☐ pendente | |

Enquanto Authenticode estiver pendente, o Windows pode não apresentar publisher verificado. Enquanto branch protection estiver pendente, o CI pode estar verde sem ser administrativamente obrigatório para todo push.

## Critério de aceite

Uma build só deve ser declarada **fisicamente validada** depois de:

- CI do SHA final totalmente verde;
- Setup e pacote técnico do mesmo run identificados;
- etapas 0–7 aprovadas;
- etapa 8 aprovada em ocorrência real/controlada antes de declarar o fallback Portal validado fisicamente;
- lifecycle/recovery da etapa 1 aprovado;
- segundo PC aprovado quando fizer parte da implantação;
- divergências registradas e corrigidas.

Authenticode e branch protection devem ser reportados pelo estado real da etapa 13; não declarar esses controles como implementados enquanto continuarem pendentes.
