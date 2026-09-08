# Aceitação física — NFe Agendamento 2.0

Este checklist cobre o que o CI não consegue provar: instalação real no Windows, navegador falando com loopback, certificado A1, SEFAZ, WebView2, Portal Nacional, captcha e impressão/PDF.

> Não provoque bloqueio/656 fazendo consultas repetidas. Valide o fallback quando o limite ocorrer naturalmente ou em um cenário controlado já disponível.

## Pré-requisitos

- Windows 10/11 x64 atualizado;
- `NFeAgendamentoBridge-Setup-v0.0.3.exe` do mesmo commit/release que será validado;
- Microsoft Edge WebView2 Runtime instalado para testar o fallback Portal;
- certificado A1 válido instalado em `CurrentUser/My` com chave privada;
- origem HTTPS exata do site disponível para informar durante o Setup;
- acesso à Internet para SEFAZ e Portal Nacional da NF-e.

> A `v0.0.3` é self-contained: não exige instalação prévia do .NET 10.

Registre antes de começar:

| Campo | Valor |
| --- | --- |
| Data | |
| Commit/versão | |
| URL do site | |
| Windows | |
| Navegador + versão | |
| PC | |

## 0. Instalação, origem, auto-start e desinstalação

1. Execute `NFeAgendamentoBridge-Setup-v0.0.3.exe` em uma conta de usuário comum.
2. Confirme que a instalação **não solicita UAC/admin**.
3. Na tela `Site do NFe Agendamento`, informe somente a origem HTTPS exata exibida no navegador, sem caminho, query string ou fragmento.
4. Confirme que uma origem inválida, `http://`, com caminho ou com caracteres extras é rejeitada pelo Setup.
5. Confirme os arquivos em `%LOCALAPPDATA%\NFe Agendamento Bridge`.
6. Confirme que `NfeAgendamento.Bridge.exe` e `NfeAgendamento.Portal.exe` estão lado a lado.
7. Confirme o atalho `NFe Agendamento Bridge` no Menu Iniciar e o ícone próprio azul/amarelo.
8. Conclua a instalação com a opção de iniciar o Bridge marcada e confirme o processo em execução sem instalar runtime .NET adicional.
9. Confirme a entrada `NFe Agendamento Bridge` em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` apontando para o executável instalado e contendo a mesma `Bridge:AllowedOrigins:0` informada no Setup.
10. Abra o atalho do Menu Iniciar e confirme que ele usa a mesma origem autorizada.
11. Encerre a sessão/reinicie o PC, faça login novamente e confirme que o Bridge iniciou automaticamente uma única vez.
12. Se já existir `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json`, anote o conteúdo/seleção antes de desinstalar.
13. Desinstale pelo Windows e confirme a remoção do diretório do aplicativo, atalho e entrada de auto-start.
14. Confirme que `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json` permanece quando já existia, permitindo preservar a seleção local em uma reinstalação.

Resultado: ☐ aprovado

## 1. Bridge e permissão de rede local

Executar separadamente em **Chrome, Edge e Firefox** quando disponíveis.

1. Confirme que o Bridge instalado está em execução.
2. Abra o site HTTPS oficial exatamente na origem autorizada durante o Setup.
3. Se o navegador pedir acesso à rede/local host, autorize.
4. Confirme `Bridge conectado`.
5. Negue/revogque a permissão uma vez e confirme o estado `Permissão de acesso local necessária` quando o navegador expuser essa distinção.
6. Feche o Bridge e confirme `Bridge não encontrado`.
7. Reinicie o Bridge pelo atalho do Menu Iniciar e confirme que volta a conectar sem reconfigurar a origem.

Resultado:

| Navegador | Conectou | Permissão local tratada | Bridge ausente tratado | Observações |
| --- | --- | --- | --- | --- |
| Chrome | ☐ | ☐ | ☐ | |
| Edge | ☐ | ☐ | ☐ | |
| Firefox | ☐ | ☐ | ☐ | |

## 2. Certificado A1

1. Confirme que o site lista somente certificados utilizáveis.
2. Selecione o A1 correto.
3. Recarregue a página.
4. Confirme que a seleção permanece pelo thumbprint.
5. Confirme que nenhum PFX, senha ou chave privada aparece em respostas de rede do site.
6. Se houver um certificado vencido no PC de teste, confirme que ele não é oferecido como utilizável.

Resultado: ☐ aprovado

## 3. Validação da chave

1. Informe menos de 44 dígitos: deve mostrar `Chave inválida` e não consultar o Bridge fiscal.
2. Informe caracteres não numéricos: deve rejeitar.
3. Informe chave com DV incorreto: deve rejeitar.
4. Informe uma chave válida conhecida.

Resultado: ☐ aprovado

## 4. Consulta SEFAZ normal

Com uma NF-e conhecida e autorizada para o certificado:

1. Clique em `Consultar` uma única vez.
2. Confirme o retorno do XML sem retry perceptível.
3. Confirme número, série e emitente apresentados.
4. Baixe o XML e compare a chave `infNFe/@Id` com a chave consultada.
5. Confirme que o XML original não foi alterado pelo tratamento Fernando Klein.

Resultado: ☐ aprovado

## 5. DANFE

1. Clique em `Visualizar DANFE`.
2. Confira emitente, destinatário, chave, protocolo, itens, totais e informações adicionais contra o XML.
3. Para nota Fernando Klein, confira o código interno somente na apresentação e preserve `cProd` no XML.
4. Verifique a coluna inicial `Item` e a contagem/ordem.
5. Use `Ctrl + scroll`: somente o DANFE deve receber zoom.
6. Feche por botão, `Esc` e backdrop.
7. Use `Imprimir / PDF` e confira aproveitamento A4/paginação.
8. Confirme que transporte/volumes não aparece quando não há conteúdo útil.

Resultado: ☐ aprovado

## 6. Estados fiscais e indisponibilidade

Quando houver casos reais/controlados, confirme:

- `Resultado fiscal` para retorno sem XML;
- `SEFAZ indisponível` para indisponibilidade de transporte;
- `Certificado A1 indisponível` quando não houver A1 selecionado/utilizável;
- `XML inválido` quando um XML não puder ser validado contra a chave.

Resultado: ☐ aprovado

## 7. Fallback 656 / Portal

Execute apenas quando o limite de consumo ocorrer naturalmente ou houver cenário de teste controlado.

1. A resposta `consumption_limit` deve iniciar o fallback sem repetir `NFeDistribuicaoDFe`.
2. Confirme que abre uma janela separada do Portal Nacional.
3. Confirme que a chave foi apenas pré-preenchida.
4. Resolva o **hCaptcha manualmente**.
5. Faça a consulta no Portal.
6. Quando o Portal pedir certificado, confirme o mesmo A1 selecionado no site.
7. Baixe o XML pelo fluxo oficial.
8. A janela deve devolver o XML ao Bridge e o site deve apresentar a NF-e usando o mesmo parser/DANFE do fluxo normal.
9. Confirme que o XML baixado pelo Portal corresponde à chave pedida.
10. Repita fechando a janela antes do fim e confirme `Consulta pelo Portal cancelada`.

Resultado: ☐ aprovado

## 8. Bloqueios do helper WebView2

Durante o teste do Portal:

- tentativa de navegação externa deve ser bloqueada;
- nova janela externa deve ser bloqueada;
- download que não seja o endpoint XML oficial deve ser bloqueado;
- não deve existir automação de captcha.

Resultado: ☐ aprovado

## 9. Segundo PC independente

Em outro PC:

1. instale o Bridge usando o mesmo Setup validado;
2. informe a mesma origem HTTPS no Setup;
3. use o A1 instalado **nesse segundo PC**;
4. abra o mesmo site;
5. faça uma consulta normal.

Confirme que não há Central, pareamento, pasta compartilhada ou dependência do primeiro PC.

Resultado: ☐ aprovado

## Critério de aceite

Uma versão só deve ser marcada como pronta para uso real depois de:

- CI do commit final totalmente verde;
- Setup e ZIP técnico correspondentes identificados;
- etapa 0 aprovada em Windows real;
- etapas 1–5 aprovadas;
- etapa 7 aprovada em uma ocorrência real/controlada de limite antes de declarar o fallback Portal validado fisicamente;
- qualquer divergência registrada e corrigida antes de declarar o ambiente validado para produção.
