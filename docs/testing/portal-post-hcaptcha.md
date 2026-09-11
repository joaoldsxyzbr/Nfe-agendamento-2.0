# Fallback Portal — automação pós-hCaptcha

**Data:** 2026-09-11  
**Repositório:** `joaoldsxyzbr/Nfe-agendamento-2.0`  
**Versão alvo:** `v0.0.10`  
**Status:** confirmação de download corrigida; validação física com Portal/A1 real continua obrigatória.

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
8. a confirmação do Portal informando que é necessário certificado digital é aceita automaticamente;
9. o certificado A1 já selecionado continua sendo escolhido pelo thumbprint;
10. o XML oficial continua sendo interceptado, limitado, validado contra a chave e devolvido ao Bridge/site;
11. a janela volta ao estado ocioso ao concluir.

Na prática, o único passo humano desejado no fallback é resolver o hCaptcha.

## Causa da falha corrigida

Na v0.0.9 o clique em **Download do Documento** já era automático, porém a autorização para aceitar o diálogo JavaScript ficava armada por apenas cerca de 1,5 segundo. O Portal pode exibir a confirmação somente depois desse intervalo, após processamento assíncrono da própria página.

Além disso, a validação do diálogo usava a URL atual do WebView em vez da URL reportada pelo próprio evento `ScriptDialogOpening`, o que podia ficar inconsistente durante uma transição da página.

A v0.0.10 corrige esses pontos:

- a autorização de confirmação permanece válida por até 60 segundos após o clique automático;
- a autorização é encerrada assim que o diálogo esperado é aceito, o download começa ou a operação termina;
- a origem do diálogo é validada pela URL do próprio evento `ScriptDialogOpening`;
- somente `Alert`/`Confirm` do host oficial contendo simultaneamente os termos `download` e `certificado digital` são aceitos automaticamente;
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
6. quando surgir a confirmação informando que é necessário possuir certificado digital, **não clicar em OK** e confirmar que o helper a aceita automaticamente;
7. confirmar que o mesmo A1 selecionado é usado;
8. confirmar captura e validação do XML correto;
9. confirmar retorno ao site e renderização pelo pipeline atual;
10. repetir em segunda operação na mesma sessão para validar reutilização do helper/WebView2;
11. fechar/cancelar durante uma operação e confirmar recuperação normal na próxima tentativa;
12. confirmar que o usuário nunca precisa interagir com nada além do hCaptcha no fluxo nominal.

> Não provocar `656` por repetição artificial de consultas. O teste deve usar uma ocorrência natural ou cenário controlado já disponível.

## Observação de compatibilidade

O Portal Nacional é uma página externa e pode alterar DOM/IDs/comportamento no futuro. Por isso a automação continua fail-closed e limitada a elementos específicos do host oficial. Se os controles oficiais deixarem de ser reconhecidos, o helper deve falhar sem ampliar seletores para ações genéricas ou aceitar diálogos fora do clique controlado.
