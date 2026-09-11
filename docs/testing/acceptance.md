# Aceitação física — NFe Agendamento 2.0

Este checklist cobre o que o CI não consegue provar: instalação real no Windows, app na bandeja, lifecycle App/Bridge, navegador falando com loopback, certificado A1, SEFAZ, WebView2, Portal Nacional, hCaptcha, DANFE/PDF e atualização.

> Não provoque bloqueio/656 fazendo consultas repetidas. Valide o fallback quando o limite ocorrer naturalmente ou em cenário controlado já disponível.

## Pré-requisitos

- Windows 10/11 x64 atualizado;
- Setup produzido pelo **mesmo commit CI** da release em teste;
- Microsoft Edge WebView2 Runtime instalado para testar o fallback Portal;
- certificado A1 válido em `CurrentUser/My` com chave privada;
- site oficial disponível exatamente em `https://nfeagendamento.joaolds.xyz.br`;
- acesso à Internet para SEFAZ, GitHub Releases e Portal Nacional da NF-e.

Versão canônica atual: **`0.0.9`**. Para validar a release pública, use `NFeAgendamentoBridge-Setup-v0.0.9.exe` e registre o SHA/tag correspondentes.

> O publish é self-contained: não exige instalação prévia do .NET 10. O WebView2 Runtime continua necessário somente para o fallback Portal.

> Os artifacts atuais não possuem Authenticode. Este checklist valida funcionamento, não identidade criptográfica de publisher.

Registre antes de começar:

| Campo | Valor |
| --- | --- |
| Data | |
| Commit SHA | |
| Versão canônica | `0.0.9` |
| Run CI / artifact | |
| URL do site | `https://nfeagendamento.joaolds.xyz.br` |
| Windows | |
| Navegador + versão | |
| PC | |

## 0. Instalação, bandeja, instância única e auto-start

1. Execute o Setup correspondente ao SHA em teste em conta de usuário comum.
2. Confirme que a instalação não solicita UAC/admin.
3. Confirme os arquivos em `%LOCALAPPDATA%\NFe Agendamento Bridge`.
4. Confirme `NfeAgendamento.App.exe`, `NfeAgendamento.Bridge.exe` e `NfeAgendamento.Portal.exe` lado a lado.
5. Confirme atalho no Menu Iniciar e ícone próprio.
6. Confirme que nenhuma janela preta de console permanece aberta.
7. Confirme ícone na bandeja e estado ativo.
8. Confirme menu **Abrir NFe Agendamento**, **Verificar atualizações** e **Sair**.
9. Dê duplo clique e confirme abertura do site oficial.
10. Confirme auto-start em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
11. Abra novamente o atalho e confirme que não surge segunda bandeja nem listener concorrente.
12. Use **Sair** e confirme encerramento gracioso do Bridge.
13. Reinicie sessão/PC e confirme início automático único.

Resultado: ☐ aprovado

## 1. Lifecycle, lease e recuperação do Bridge

1. Com App + Bridge ativos, finalize somente `NfeAgendamento.Bridge.exe` pelo Gerenciador de Tarefas.
2. Confirme que o tray entra em reconexão.
3. Confirme reinício automático conforme backoff e retorno ao estado ativo.
4. Repita quedas controladas e confirme ausência de restart-loop infinito; ao exceder o limite, deve indicar **Bridge indisponível**.
5. Reabra o App e confirme recuperação normal.
6. Com instância gerenciada válida existente, abra o App novamente e confirme que ele não mata o Bridge nem cria listener concorrente.
7. Use **Sair** e confirme shutdown controlado.

Resultado: ☐ aprovado

## 2. Bridge HTTP, Origin oficial e permissão local

Executar em Chrome, Edge e Firefox quando disponíveis.

1. Abra o site oficial com App/Bridge ativos.
2. Autorize acesso local quando o navegador solicitar.
3. Confirme `Bridge conectado`.
4. Negue/revogue a permissão uma vez e confira tratamento de permissão local quando suportado pelo navegador.
5. Use **Sair** e confirme `Bridge não encontrado`.
6. Reinicie o App e confirme reconexão sem configurar origem.
7. Em origem diferente, confirme rejeição da chamada ao Bridge.
8. Confirme, quando possível, escuta somente em `127.0.0.1:17345`.

Resultado: ☐ aprovado

## 3. Certificado A1

1. Confirme que o site lista somente certificados utilizáveis.
2. Selecione o A1 correto.
3. Recarregue a página e confirme persistência pelo thumbprint.
4. Confirme que PFX, senha e chave privada não aparecem nas respostas de rede.
5. Certificados vencidos não devem ser oferecidos como utilizáveis.

Resultado: ☐ aprovado

## 4. Validação da chave

- menos de 44 dígitos: rejeitar sem consulta fiscal;
- caracteres não numéricos: rejeitar;
- DV incorreto: rejeitar;
- chave válida conhecida: aceitar.

Resultado: ☐ aprovado

## 5. Consulta SEFAZ normal

1. Consulte uma NF-e conhecida e autorizada para o certificado.
2. Confirme uma única tentativa perceptível, sem retry fiscal automático.
3. Confira número, série e emitente.
4. Baixe o XML e compare `infNFe/@Id` com a chave consultada.
5. Confirme que o XML original não foi alterado pelo tratamento Fernando Klein.

Resultado: ☐ aprovado

## 6. DANFE e interface de consulta

1. Confirme resultado integrado à consulta e ação **Nova consulta**.
2. Clique em `Visualizar DANFE`.
3. Confira emitente, destinatário, chave, protocolo, itens, totais e informações adicionais contra o XML.
4. Para Fernando Klein, confira código interno somente na apresentação e preserve `cProd` no XML.
5. Verifique coluna inicial `Item` e contagem/ordem.
6. Use `Ctrl + scroll`: somente o DANFE deve receber zoom.
7. Feche por botão, `Esc` e backdrop.
8. Use `Imprimir / PDF` e confira A4/paginação.
9. Confirme que transporte/volumes não aparece sem conteúdo útil.
10. Confirme que o atalho de download do app aponta para `NFeAgendamentoBridge-Setup-v0.0.9.exe`.

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
10. Não clique em **OK** em `Alert`/`Confirm` associado ao download; confirme que é aceito automaticamente.
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
- diálogos JavaScript não são aceitos genericamente fora do clique controlado de download;
- pacote contém WebView2 Core + WinForms e não depende de `Microsoft.Web.WebView2.Wpf.dll`.

Resultado: ☐ aprovado

## 10. Atualizador manual

1. Em uma instalação v0.0.8, clique em **Verificar atualizações**.
2. Confirme descoberta da v0.0.9.
3. Confirme exibição da versão e pedido de confirmação.
4. Confirme que asset/tamanho/SHA-256 inválidos impedem execução.
5. Após confirmação válida, confirme que o Setup v0.0.9 inicia e App/Bridge encerram para substituição.
6. Após atualizar, confirme que nova verificação informa que a versão está atualizada.

Detalhes: `docs/testing/bridge-updater.md`.

Resultado: ☐ aprovado

## 11. Desinstalação e persistência local

1. Anote `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json`, se existir.
2. Desinstale pelo Windows.
3. Confirme remoção do diretório do aplicativo, atalho e auto-start.
4. Confirme preservação de `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json` quando já existia.

Resultado: ☐ aprovado

## 12. Segundo PC independente

1. Instale o mesmo Setup v0.0.9 validado.
2. Confirme início na bandeja sem console.
3. Use o A1 instalado nesse segundo PC.
4. Abra o site oficial e faça consulta normal.
5. Confirme ausência de Central, pareamento, pasta compartilhada ou dependência do primeiro PC.

Resultado: ☐ aprovado

## 13. Hardening externo

| Controle | Estado | Evidência |
| --- | --- | --- |
| Authenticode App/Bridge/Portal/Setup | ☐ configurado / ☐ pendente | |
| Proteção da `main` + required CI checks | ☐ configurado / ☐ pendente | |

Enquanto Authenticode estiver pendente, o Windows pode não apresentar publisher verificado. Enquanto branch protection estiver pendente, o CI pode estar verde sem ser administrativamente obrigatório para todo push.

## Critério de aceite

Uma release só deve ser declarada fisicamente validada depois de:

- CI do SHA final totalmente verde;
- tag/release apontando para o SHA validado;
- Setup e pacote técnico da mesma execução identificados;
- etapas 0–7 aprovadas;
- etapa 8 aprovada em ocorrência real/controlada;
- lifecycle/recovery aprovado;
- atualização v0.0.8 → v0.0.9 validada;
- segundo PC aprovado quando fizer parte da implantação;
- divergências registradas e corrigidas.

Authenticode e branch protection devem ser reportados pelo estado real; não declarar esses controles como implementados enquanto continuarem pendentes.
