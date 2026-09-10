# Fallback Portal — automação pós-hCaptcha

**Data:** 2026-09-10  
**Repositório:** `joaoldsxyzbr/Nfe-agendamento-2.0`  
**Implementação:** `f8ec151c227f5d1dddd792c66eebc1ba4ed47d38`  
**Status:** implementado e validado pelo CI; teste físico com Portal/A1 real ainda obrigatório.

## Objetivo

Reduzir o fallback pelo Portal Nacional ao mínimo de interação humana sem automatizar ou contornar o hCaptcha.

Experiência esperada durante uma ocorrência real/controlada de `consumption_limit`:

1. o site abre o helper Portal automaticamente;
2. a chave NF-e já aparece preenchida;
3. o usuário resolve o **hCaptcha manualmente**;
4. quando o próprio hCaptcha publica uma resposta válida em `h-captcha-response`, o helper aciona a consulta oficial;
5. quando o resultado disponibiliza **Download do Documento**, o helper aciona o download oficial;
6. somente a confirmação JavaScript associada a esse clique controlado pode ser aceita automaticamente;
7. o certificado A1 já selecionado continua sendo escolhido pelo thumbprint;
8. o XML oficial continua sendo interceptado, limitado, validado contra a chave e devolvido ao Bridge/site;
9. a janela volta ao estado ocioso ao concluir.

Na prática, o único passo humano desejado no fallback é resolver o hCaptcha.

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
- o download automático reconhece somente o endpoint oficial `/portal/downloadNFe.aspx` ou o controle com rótulo exato `Download do Documento` dentro da página oficial;
- diálogos JavaScript não são aceitos genericamente: `Alert`/`Confirm` só podem ser aceitos enquanto o helper executa o clique de download previamente reconhecido;
- navegação e popups externos continuam bloqueados;
- certificado continua selecionado somente pelo thumbprint já escolhido e somente para o host oficial;
- download fora do endpoint XML oficial continua cancelado;
- XML continua limitado a 10 MiB, com DTD proibido, `XmlResolver = null`, raiz `nfeProc` e `infNFe/@Id` obrigatório igual a `NFe + chave`;
- uma operação Portal por PC continua sendo a regra;
- não foi adicionado retry fiscal automático.

## Alterações de código

A mudança ficou restrita a:

- `apps/bridge/windows/NfeAgendamento.Portal/PortalWindow.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/PortalHelperStaticTests.cs`.

Não foram alterados:

- consulta `NFeDistribuicaoDFe`;
- classificação fiscal/`consumption_limit`;
- parser XML;
- DANFE;
- tratamento Fernando Klein;
- API HTTP do Bridge;
- updater;
- versão canônica;
- workflow de release.

## Cobertura automatizada

O teste estático do helper passou a exigir explicitamente:

- observação de `h-captcha-response`;
- uso do botão oficial de consulta hCaptcha;
- escopo do download oficial;
- presença de `ScriptDialogOpening` com `Confirm`/`Alert`;
- guarda `_acceptExpectedPortalDialog`;
- ausência de `hcaptcha.execute` e `grecaptcha.execute`.

O CI do commit de implementação foi o run `34471269508` e terminou verde nos três jobs:

- `web` — testes, build e `wrangler deploy --dry-run`;
- `bridge` — suíte .NET e build do Bridge;
- `windows-package` — publish Bridge, **publish do Portal helper**, publish do App, geração do Setup e upload dos dois artifacts Windows.

## Aceitação física específica

Em uma ocorrência natural/controlada de limite de consumo, validar no Windows:

1. confirmar que o Portal só abre após `consumption_limit`;
2. confirmar a chave preenchida corretamente;
3. resolver somente o hCaptcha, sem clicar manualmente em **Consultar/Continuar**;
4. confirmar que a consulta avança sozinha após a resposta do captcha;
5. não clicar manualmente em **Download do Documento**; confirmar que o helper aciona esse passo sozinho;
6. se o Portal exibir `Alert`/`Confirm` associado ao download, confirmar que ele é aceito sem intervenção;
7. confirmar que o mesmo A1 selecionado é usado;
8. confirmar captura e validação do XML correto;
9. confirmar retorno ao site e renderização pelo pipeline atual;
10. repetir em segunda operação na mesma sessão para validar reutilização do helper/WebView2;
11. fechar/cancelar durante uma operação e confirmar recuperação normal na próxima tentativa;
12. confirmar que o usuário nunca precisa interagir com nada além do hCaptcha no fluxo nominal.

> Não provocar `656` por repetição artificial de consultas. O teste deve usar uma ocorrência natural ou cenário controlado já disponível.

## Observação de compatibilidade

O Portal Nacional é uma página externa e pode alterar DOM/IDs/comportamento no futuro. Por isso a automação foi deliberadamente fail-closed e baseada em elementos específicos. Se os controles oficiais deixarem de ser reconhecidos, o helper deve deixar de automatizar aquela etapa em vez de ampliar seletores ou aceitar ações genéricas.

Nenhuma nova release foi criada nesta mudança. Para teste anterior a uma release posterior, usar o artifact Windows produzido pelo CI do SHA efetivamente validado.
