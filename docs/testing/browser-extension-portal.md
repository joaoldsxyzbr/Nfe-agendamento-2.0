# Portal via extensão Chromium MV3 — instalação e aceitação

**Data:** 2026-09-22  
**Status:** piloto técnico; validação física com Portal/A1 real ainda obrigatória.

## Objetivo

Validar o novo fallback do Portal Nacional dentro do próprio Chrome/Edge, preservando o helper WebView2 atual como rollback.

A extensão não substitui a consulta direta SEFAZ nesta fase. O Bridge continua responsável por A1/SEFAZ, proteção fiscal, coordenação multi-PC e regras locais de fornecedor.

## Obter o pacote

Na release pública **v0.0.24**, baixe o asset:

`NFeAgendamento-Extension-v0.2.2.zip`

O job `extension` do GitHub Actions também mantém o artifact técnico `NFeAgendamento-Extension-MV3` para rastreabilidade do CI.

Extraia o ZIP para uma pasta local antes de carregar a extensão. O pacote é uma extensão **não compactada** para teste interno; esta fase não publica automaticamente na Chrome Web Store.

A v0.0.24 mantém retries limitados de handshake e reinjeção idempotente, adiciona o anúncio reativo `bridge_ready`, revalidação em `focus`, `pageshow` e retorno de visibilidade, compatibilidade com o casing legado do `supplier-rules.json` e restrição do armazenamento local a contextos confiáveis. Isso reduz falsos **Extensão não conectada** e elimina a necessidade de editar manualmente arquivos válidos do Bridge.

## Instalar no Chrome

1. abra `chrome://extensions`;
2. ative **Modo do desenvolvedor**;
3. clique em **Carregar sem compactação**;
4. selecione a pasta extraída que contém `manifest.json`;
5. confirme que a extensão aparece como **NFe Agendamento - Portal**.

## Instalar no Edge

1. abra `edge://extensions`;
2. habilite o modo de desenvolvedor;
3. escolha **Carregar descompactado**;
4. selecione a pasta extraída.

## Permissões esperadas

O Manifest V3 deve declarar somente:

- `scripting`;
- `storage`;
- `webRequest`.

Host permissions:

- `https://nfeagendamento.joaolds.xyz.br/*`;
- `https://www.nfe.fazenda.gov.br/*`.

Não são esperados:

- `<all_urls>`;
- `downloads`;
- Native Messaging;
- acesso genérico ao sistema de arquivos;
- `webRequestBlocking`;
- permissão para outros sites.

## Fluxo esperado

Quando a consulta direta entrar legitimamente no fallback por Portal:

1. o site detecta a extensão;
2. a extensão abre uma janela popup do navegador;
3. a janela navega para o Portal Nacional;
4. a chave NF-e aparece preenchida;
5. o usuário resolve o **hCaptcha manualmente**;
6. somente depois da resposta humana, a extensão aciona o botão oficial de consulta;
7. quando o resultado estiver disponível, a extensão aciona o controle oficial **Download do Documento**;
8. a extensão observa somente a requisição oficial de download e tenta obter o XML pela mesma sessão do navegador;
9. o XML volta ao site;
10. o site aplica a validação canônica contra a chave, parser, regra de fornecedor e DANFE atuais;
11. a janela do Portal fecha ao terminar.

A extensão não executa, resolve ou contorna captcha.

## Rollback

Se a extensão estiver ausente ou falhar no **handshake inicial**, antes de ser escolhida para a tentativa, o site usa o helper WebView2 atual.

Depois que a extensão respondeu ao handshake e foi escolhida, qualquer erro no `start` ou durante a operação falha de modo fechado: o site **não** abre automaticamente um segundo Portal para a mesma tentativa. Isso evita popup da extensão + WebView2 simultâneos caso a resposta do `start` se perca após a criação da janela. Uma nova ação explícita pode usar o caminho de recuperação apropriado.

Para testar o rollback:

1. desabilite a extensão em `chrome://extensions` ou `edge://extensions`;
2. recarregue o site;
3. em uma ocorrência legítima de fallback, confirme que o helper WebView2 atual continua abrindo.

## Gate isolado sem Bridge

Para este gate use a extensão **0.2.2** publicada na release **v0.0.24**. A extensão **0.1.0** da v0.0.21 não possui o handshake/capabilities necessários e será tratada como incompatível pela página de teste.


Antes de migrar o aplicativo principal, use a página `/extension-test.html` no domínio oficial.

Para este teste:

1. pare ou desinstale o Bridge;
2. mantenha a extensão 0.2.2 da release v0.0.24 instalada;
3. abra `https://nfeagendamento.joaolds.xyz.br/extension-test.html`;
4. confirme **Extensão conectada** e a versão;
5. informe uma chave legítima;
6. clique em **Testar consulta sem Bridge**;
7. confirme popup do Chrome/Edge e chave preenchida;
8. resolva o hCaptcha manualmente;
9. quando solicitado pelo Portal/navegador, use o A1 instalado no Windows;
10. confirme que a página recebe e valida o XML;
11. repita uma segunda consulta;
12. feche o popup no meio de uma consulta e confirme o cancelamento;
13. repita no Edge.

Esse gate não importa `BridgeClient` e não chama `127.0.0.1:17345`. Se certificado ou captura do XML falharem aqui, a remoção do Bridge deve parar.

## Gate físico

Antes de remover o helper WebView2, validar em Windows real:

1. Chrome e Edge;
2. A1 válido instalado no Windows;
3. popup do navegador;
4. chave preenchida corretamente;
5. hCaptcha resolvido manualmente;
6. uso normal do certificado pelo navegador/Portal;
7. retorno do XML ao site;
8. DANFE e download XML;
9. segunda operação na mesma sessão;
10. lote sequencial com pelo menos duas NF-e que passem pelo Portal;
11. fechamento/cancelamento da janela;
12. rollback com a extensão desabilitada.

Não provoque `656` por repetição artificial de consultas apenas para chegar ao Portal.

## Falha de captura do XML

O Portal é externo e pode alterar DOM, scripts ou a forma como inicia o download. Se a reprodução segura da requisição oficial não funcionar no navegador real, o resultado esperado do piloto é uma falha explícita, mantendo WebView2 como fallback.

Não ampliar permissões da extensão, não adicionar acesso genérico ao disco e não automatizar captcha para contornar uma incompatibilidade do Portal.
