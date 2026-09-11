# Fallback Portal — automação pós-hCaptcha

**Data:** 2026-09-11  
**Repositório:** `joaoldsxyzbr/Nfe-agendamento-2.0`  
**Versão alvo:** `v0.0.11`  
**Status:** interceptação do diálogo JavaScript corrigida; validação física com Portal/A1 real continua obrigatória.

## Objetivo

Reduzir o fallback pelo Portal Nacional ao mínimo de interação humana sem automatizar ou contornar o hCaptcha.

Experiência esperada quando o fallback é elegível (`consumption_limit` ou `fiscal_status` com `cStat 217`):

1. o site abre o helper Portal automaticamente;
2. a chave NF-e já aparece preenchida;
3. o usuário resolve o **hCaptcha manualmente**;
4. quando o próprio hCaptcha publica uma resposta válida em `h-captcha-response`, o helper aciona a consulta oficial;
5. o helper continua observando a página de resultado, inclusive quando o Portal atualiza o DOM sem uma navegação completa;
6. o controle **Download do Documento** é reconhecido mesmo quando o texto visível contém sufixos como `*`;
7. o helper aciona o download oficial automaticamente;
8. a confirmação JavaScript do Portal informando que é necessário certificado digital é interceptada e aceita automaticamente;
9. o certificado A1 já selecionado continua sendo escolhido pelo thumbprint;
10. o XML oficial continua sendo interceptado, limitado, validado contra a chave e devolvido ao Bridge/site;
11. a janela volta ao estado ocioso ao concluir.

Na prática, o único passo humano desejado no fallback é resolver o hCaptcha.

## Causa da falha corrigida

A v0.0.10 continha um handler `ScriptDialogOpening` correto em intenção, com validação por origem, tipo, mensagem e janela temporal. Porém o WebView2 continuava com `AreDefaultScriptDialogsEnabled` no valor padrão (`true`).

Segundo a API do WebView2, `ScriptDialogOpening` só é disparado quando os diálogos JavaScript padrão estão desativados. Por isso o `Alert`/`Confirm` oficial continuava aparecendo na tela e o handler nunca recebia o evento para executar `Accept()`.

A v0.0.11 corrige a causa real:

- `core.Settings.AreDefaultScriptDialogsEnabled = false` é configurado na inicialização do WebView2;
- `ScriptDialogOpening` passa efetivamente a receber os diálogos JavaScript do Portal;
- somente `Alert`/`Confirm` do host oficial contendo simultaneamente os termos `download` e `certificado digital` são aceitos automaticamente;
- a autorização continua limitada a até 60 segundos após o clique automático em **Download do Documento**;
- a autorização é encerrada assim que o diálogo esperado é aceito, o download começa ou a operação termina;
- não existe aceite genérico de diálogos do Portal.

## Limites de automação

A implementação não resolve, executa nem contorna captcha.

Continuam proibidos e ausentes:

- `hcaptcha.execute`;
- `grecaptcha.execute`;
- serviços externos de resolução de captcha;
- injeção/fabricação de token;
- clique sintético dentro do desafio do hCaptcha.

O helper apenas observa o campo de resposta que o hCaptcha preenche **depois da interação humana válida**. Sem resposta não vazia, o botão oficial de consulta não é acionado automaticamente.

## Restrições de segurança preservadas

- WebView2 continua limitado ao host `www.nfe.fazenda.gov.br` em HTTPS;
- a página de consulta reconhecida continua restrita a `/portal/consultaRecaptcha.aspx`;
- a continuação usa somente os IDs oficiais conhecidos `btnConsultarHCaptcha` / `btnConsultar`;
- o download automático reconhece somente o endpoint oficial `/portal/downloadNFe.aspx` ou um controle clicável cujo rótulo normalizado comece com `Download do Documento` dentro da página oficial;
- os diálogos padrão do WebView2 ficam desativados para permitir a interceptação pelo `ScriptDialogOpening`;
- diálogos JavaScript não são aceitos genericamente: a confirmação automática exige origem oficial, janela temporal armada pelo clique de download e mensagem compatível com a exigência de certificado digital;
- navegação e popups externos continuam bloqueados;
- certificado continua selecionado somente pelo thumbprint já escolhido e somente para o host oficial;
- download fora do endpoint XML oficial continua cancelado;
- XML continua limitado a 10 MiB, com DTD proibido, `XmlResolver = null`, raiz `nfeProc` e `infNFe/@Id` obrigatório igual a `NFe + chave`;
- uma operação Portal por PC continua sendo a regra;
- não foi adicionado retry fiscal automático.

## Alterações de código

A correção fica concentrada em:

- `apps/bridge/windows/NfeAgendamento.Portal/PortalWindow.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PortalHelperStaticTests.cs`.

Não foram alterados por esta correção:

- consulta `NFeDistribuicaoDFe`;
- parser XML;
- DANFE;
- tratamento Fernando Klein;
- API HTTP do Bridge;
- política do updater;
- mecanismo de resolução do hCaptcha.

## Cobertura automatizada

O teste estático do helper exige explicitamente:

- observação de `h-captcha-response`;
- uso do botão oficial de consulta hCaptcha;
- reconhecimento tolerante apenas ao sufixo visual do rótulo `Download do Documento`;
- monitoramento prolongado do resultado (`DownloadProbeAttempts`);
- escopo do endpoint oficial de download;
- presença de `ScriptDialogOpening` com `Confirm`/`Alert`;
- `AreDefaultScriptDialogsEnabled = false`, pré-condição exigida pelo WebView2 para disparar `ScriptDialogOpening`;
- guarda `_acceptExpectedPortalDialog` com janela temporal explícita;
- validação da URL do próprio evento;
- filtro de mensagem exigindo `download` e `certificado digital`;
- ausência de `hcaptcha.execute` e `grecaptcha.execute`.

## Aceitação física específica

Em uma ocorrência real/controlada de fallback, validar no Windows:

1. confirmar que o Portal só abre após `consumption_limit` ou `fiscal_status` com `cStat 217`;
2. confirmar a chave preenchida corretamente;
3. resolver somente o hCaptcha, sem clicar manualmente em **Consultar/Continuar**;
4. confirmar que a consulta avança sozinha após a resposta do captcha;
5. **não clicar** em **Download do Documento** e confirmar que o helper aciona esse passo sozinho;
6. confirmar que a caixa `www.nfe.fazenda.gov.br diz ... Clique em Ok para iniciar o download` não permanece visível aguardando ação manual;
7. confirmar que o mesmo A1 selecionado é usado;
8. confirmar captura e validação do XML correto;
9. confirmar retorno ao site e renderização pelo pipeline atual;
10. repetir em segunda operação na mesma sessão para validar reutilização do helper/WebView2;
11. fechar/cancelar durante uma operação e confirmar recuperação normal na próxima tentativa;
12. confirmar que o usuário nunca precisa interagir com nada além do hCaptcha no fluxo nominal.

> Não provocar `656` por repetição artificial de consultas. O teste deve usar uma ocorrência natural ou cenário controlado já disponível.

## Observação de compatibilidade

O Portal Nacional é uma página externa e pode alterar DOM/IDs/comportamento no futuro. Por isso a automação continua fail-closed e limitada a elementos específicos do host oficial. Se os controles oficiais deixarem de ser reconhecidos, o helper deve falhar sem ampliar seletores para ações genéricas ou aceitar diálogos fora do clique controlado.
