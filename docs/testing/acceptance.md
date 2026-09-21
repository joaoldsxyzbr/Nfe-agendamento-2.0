# Aceitação física — NFe Agendamento 2.0

Este checklist cobre o que o CI não consegue provar: instalação real no Windows, lifecycle do componente local, navegador falando com loopback, certificado A1, SEFAZ, WebView2, Portal Nacional, hCaptcha, DANFE/PDF e atualização. Na transição site-first, o App pode existir como supervisor headless; o piloto standalone possui checklist adicional próprio.

> Não provoque bloqueio/656 fazendo consultas repetidas. Valide o fallback quando o limite ocorrer naturalmente ou em cenário controlado já disponível.

## Pré-requisitos

- Windows 10/11 x64 atualizado;
- Setup produzido pelo **mesmo commit CI** da release em teste;
- Microsoft Edge WebView2 Runtime instalado para testar o fallback Portal;
- certificado A1 válido em `CurrentUser/My` com chave privada;
- site oficial disponível exatamente em `https://nfeagendamento.joaolds.xyz.br`;
- acesso à Internet para SEFAZ, GitHub Releases e Portal Nacional da NF-e.

A versão em teste deve ser lida de `Directory.Build.props` e precisa coincidir com o nome do Setup, o SHA validado pelo CI e a tag/release correspondente. Este checklist não fixa um número de versão para não ficar obsoleto.

> O publish é self-contained: não exige instalação prévia do .NET 10. O WebView2 Runtime continua necessário somente para o fallback Portal.

Registre antes de começar:

| Campo | Valor |
| --- | --- |
| Data | |
| Commit SHA | |
| Versão canônica | preencher a partir de `Directory.Build.props` |
| Run CI / artifact | |
| URL do site | `https://nfeagendamento.joaolds.xyz.br` |
| Windows | |
| Navegador + versão | |
| PC | |

## 0. Instalação, supervisor headless, instância única e auto-start

1. Execute o Setup correspondente ao SHA em teste em conta de usuário comum.
2. Confirme que a instalação não solicita UAC/admin.
3. Confirme os arquivos em `%LOCALAPPDATA%\NFe Agendamento Bridge`.
4. Confirme `NfeAgendamento.App.exe`, `NfeAgendamento.Bridge.exe` e `NfeAgendamento.Portal.exe` lado a lado.
5. Confirme atalho no Menu Iniciar e ícone próprio.
6. Confirme que nenhuma janela preta de console permanece aberta.
7. No modo padrão `app`, confirme que `NfeAgendamento.App.exe` inicia sem ícone de bandeja, menu ou janela visível.
8. Confirme auto-start em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` apontando para o executável previsto pelo modo do Setup.
9. Abra o site oficial manualmente e confirme conexão com o Bridge.
10. Inicie novamente o App e confirme que não surge segunda instância nem listener concorrente.
11. Reinicie sessão/PC e confirme início automático único.
12. Para o piloto `BridgeAutostartMode=standalone`, execute também `docs/testing/standalone-bridge.md`.

Resultado: ☐ aprovado

## 1. Lifecycle, lease e recuperação do Bridge

### Modo padrão `app`

1. Com supervisor headless + Bridge ativos, finalize somente `NfeAgendamento.Bridge.exe` pelo Gerenciador de Tarefas.
2. Pelo diagnóstico do site, confirme indisponibilidade temporária e depois reconexão após o backoff do supervisor.
3. Repita quedas controladas e confirme ausência de restart-loop infinito.
4. Com instância gerenciada válida existente, inicie novamente o App e confirme que ele não mata o Bridge nem cria listener concorrente.
5. Encerre o supervisor e confirme que o lease do Bridge gerenciado expira/encerra sem deixar listener órfão; reabra o App e confirme recuperação normal.

### Piloto standalone

Validar separadamente com `docs/testing/standalone-bridge.md`. No modo standalone não se espera reinício pelo App supervisor.

Resultado: ☐ aprovado

## 2. Bridge HTTP, Origin oficial e permissão local

Executar em Chrome, Edge e Firefox quando disponíveis.

1. Abra o site oficial com o componente local ativo.
2. Autorize acesso local quando o navegador solicitar.
3. Confirme `Bridge conectado`.
4. Negue/revogue a permissão uma vez e confira tratamento de permissão local quando suportado pelo navegador.
5. Pare o componente local de forma controlada e confirme `Bridge não encontrado`/estado equivalente no diagnóstico.
6. Inicie novamente o modo em teste e confirme reconexão sem configurar origem.
7. Em origem diferente, confirme rejeição da chamada ao Bridge.
8. Confirme, quando possível, escuta somente em `127.0.0.1:17345`.

Resultado: ☐ aprovado

## 2.1. Diagnóstico local

1. Abra **Configurações** e confirme que o bloco **Diagnóstico local** aparece antes do certificado.
2. Com Bridge ativo, confirme **Bridge: Conectado** e versão igual à instalada.
3. Confirme que **Certificado A1** reflete se há thumbprint selecionado.
4. Com WebView2 Runtime disponível, confirme **Portal / WebView2: Disponível**; sem Runtime, confirme **Indisponível**.
5. Clique em **Atualizar** e confirme atualização do horário da última verificação.
6. Pare o Bridge, clique em **Atualizar** e confirme estado **Indisponível** com erro legível.
7. Confirme que uma mensagem de erro contendo uma sequência alfanumérica de 44 caracteres não exibe essa sequência integralmente.

Resultado: ☐ aprovado

## 3. Certificado A1

1. Confirme que o site lista somente certificados utilizáveis.
2. Selecione o A1 correto.
3. Recarregue a página e confirme persistência pelo thumbprint.
4. Confirme que PFX, senha e chave privada não aparecem nas respostas de rede.
5. Certificados vencidos não devem ser oferecidos como utilizáveis.

Resultado: ☐ aprovado

## 4. Validação da chave

- menos de 44 caracteres: rejeitar sem consulta fiscal;
- caracteres fora da estrutura permitida: rejeitar;
- DV incorreto: rejeitar;
- chave NF-e modelo 55 numérica válida: aceitar;
- chave NF-e modelo 55 com CNPJ/chave alfanuméricos válidos: aceitar;
- chave NFC-e modelo 65: rejeitar explicitamente.

Resultado: ☐ aprovado

## 5. Consulta SEFAZ normal

1. Consulte uma NF-e conhecida e autorizada para o certificado.
2. Confirme uma única tentativa perceptível, sem retry fiscal automático.
3. Confira número, série e emitente.
4. Baixe o XML e compare `infNFe/@Id` com a chave consultada.
5. Confirme que o XML original não foi alterado por regras de apresentação de fornecedor.

Resultado: ☐ aprovado

## 6. DANFE e interface de consulta

1. Confirme resultado integrado à consulta e ação **Nova consulta**.
2. Clique em `Visualizar DANFE`.
3. Confira emitente, destinatário, chave, protocolo, itens, totais e informações adicionais contra o XML.
4. Para Fernando Klein e Dionisio, confira `cProd` na primeira linha e `[código interno]` abaixo, sem alterar o XML.
5. Para Souza Cruz, confira quantidade fiscal preservada e `[<unidades> UN]` somente quando a conversão declarada for válida.
6. Verifique coluna inicial `Item` e contagem/ordem.
7. Use `Ctrl + scroll`: somente o DANFE deve receber zoom.
8. Feche por botão, `Esc` e backdrop.
9. Use `Imprimir / PDF` e confira A4/paginação.
10. Confirme que transporte/volumes não aparece sem conteúdo útil.
11. Confirme que o atalho de download aponta para o Setup da versão canônica indicada em `Directory.Build.props`.

Resultado: ☐ aprovado

## 7. Estados fiscais e indisponibilidade

Quando houver casos reais/controlados, confirme:

- `Resultado fiscal` para retorno sem XML;
- `SEFAZ indisponível` para indisponibilidade de transporte;
- `Certificado A1 indisponível` quando não houver A1 selecionado/utilizável;
- `XML inválido` quando XML não corresponder à chave.

Resultado: ☐ aprovado

## 8. WebView2 Runtime e fallback 656/217 / Portal

Antes do cenário de fallback:

1. Com Runtime instalado, confirme `webView2Available=true` sem abrir janela durante health.
2. Sem Runtime, confirme `webView2Available=false` sem abrir janela apenas para detectar ausência.

Quando houver `consumption_limit` natural/controlado ou uma chave conhecida que retorne `cStat 217` na consulta direta:

3. `consumption_limit` deve iniciar fallback sem repetir `NFeDistribuicaoDFe`.
4. `fiscal_status` com `cStat 217` também deve iniciar o mesmo fallback, sem repetir `NFeDistribuicaoDFe`.
5. Outros `fiscal_status` não devem abrir o Portal automaticamente.
6. Confirme chave pré-preenchida.
7. Resolva **somente o hCaptcha manualmente**.
8. Não clique em **Consultar/Continuar**; confirme que a consulta avança sozinha após a resposta válida do hCaptcha.
9. Não clique em **Download do Documento**; confirme que o helper reconhece também o rótulo com sufixo `*` e aciona o download oficial automaticamente.
10. A confirmação JavaScript informando que é necessário possuir certificado digital **não deve ficar visível aguardando OK**; o helper deve interceptá-la via `ScriptDialogOpening` e aceitá-la automaticamente.
11. Confirme uso automático do mesmo A1 selecionado.
12. Confirme retorno do XML ao Bridge/site usando o mesmo parser/DANFE.
13. Confirme que o XML corresponde à chave.
14. Repita uma segunda ocorrência controlada e confirme reutilização do helper/WebView2.
15. Feche a janela antes do fim e confirme `Consulta pelo Portal cancelada`.
16. Inicie nova ocorrência após cancelamento e confirme recuperação normal.
17. Recarregue/feche a página durante uma operação e confirme que ela não fica presa indefinidamente.

Resultado: ☐ aprovado

Detalhes adicionais: `docs/testing/portal-post-hcaptcha.md`.

## 9. Bloqueios do helper WebView2

Durante o teste do Portal:

- navegação externa bloqueada;
- nova janela externa bloqueada;
- download fora de `/portal/downloadNFe.aspx` bloqueado;
- hCaptcha continua exclusivamente manual;
- não existem `hcaptcha.execute`, `grecaptcha.execute`, serviço de resolução ou fabricação de token;
- `AreDefaultScriptDialogsEnabled` deve permanecer desativado no helper para que `ScriptDialogOpening` receba os diálogos JavaScript;
- diálogos JavaScript não são aceitos genericamente: o aceite automático exige origem oficial, janela temporal armada pelo clique de download e mensagem contendo `download` e `certificado digital`;
- pacote contém WebView2 Core + WinForms e não depende de `Microsoft.Web.WebView2.Wpf.dll`.

Resultado: ☐ aprovado

## 10. Atualização pelo site

1. Instale a última versão pública anterior à release candidata.
2. Abra **Configurações** no site e confirme que a versão instalada vem de `GET /api/v1/health`.
3. Confirme que uma release estável mais nova gera a ação **Atualizar componente Windows para X.Y.Z**.
4. Confirme que o download usa somente `nfeagendamento.joaolds.xyz.br/downloads/windows/...` e o nome exato do Setup versionado.
5. Execute o Setup e confirme preservação de `%LOCALAPPDATA%\NfeAgendamentoBridge`.
6. Após o componente voltar, confirme no diagnóstico do site a versão nova e ausência de atualização pendente.
7. Confirme que o supervisor headless não cria menu ou caixa de diálogo de atualização.

Detalhes: `docs/testing/bridge-updater.md`.

Resultado: ☐ aprovado

## 11. Desinstalação e persistência local

1. Anote `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json`, se existir.
2. Desinstale pelo Windows.
3. Confirme remoção do diretório do aplicativo, atalho e auto-start.
4. Confirme preservação de `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json` quando já existia.

Resultado: ☐ aprovado

## 12. Segundo PC independente

1. Instale o mesmo Setup validado pelo SHA da release em teste.
2. Confirme início sem console e, no modo padrão, sem UI visível do supervisor.
3. Use o A1 instalado nesse segundo PC.
4. Abra o site oficial e faça consulta normal.
5. Confirme ausência de Central, pareamento, pasta compartilhada ou dependência do primeiro PC.
6. Se o segundo PC usar uma cópia do mesmo A1 RSA, confirme que a proteção fiscal compartilhada não permite ultrapassar o teto coordenado entre os PCs.

Resultado: ☐ aprovado

## Critério de aceite

Uma release só deve ser declarada fisicamente validada depois de:

- CI do SHA final totalmente verde;
- tag/release apontando para o SHA validado;
- Setup e pacote técnico da mesma execução identificados;
- etapas 0–7 aprovadas;
- etapa 8 aprovada em ocorrência real/controlada;
- lifecycle/recovery aprovado;
- atualização da versão pública anterior → release candidata validada pelo fluxo site-first e Setup oficial;
- segundo PC aprovado quando fizer parte da implantação;
- divergências registradas e corrigidas.

Authenticode e branch protection/ruleset são opcionais neste projeto e não fazem parte do critério de aceite.
