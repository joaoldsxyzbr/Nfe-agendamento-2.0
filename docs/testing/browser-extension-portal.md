# Portal via extensão Chromium MV3

**Estado atual:** componente local único do NFe Agendamento.

## Arquitetura

```text
Site → extensão Chromium → Portal Nacional → A1 via navegador/Windows
```

Não existe Bridge ou helper WebView2 no produto atual.

## Versão

A `main` usa extensão **0.2.5**. A release correspondente é a **v0.0.27**, com os assets `NFeAgendamento-Extension.zip` e `NFeAgendamento-Extension-v0.2.5.zip`.

## Instalação de desenvolvimento

Chrome:

1. abrir `chrome://extensions`;
2. ativar modo do desenvolvedor;
3. usar **Carregar sem compactação**;
4. selecionar a pasta que contém `manifest.json`.

Edge: fluxo equivalente em `edge://extensions`.

## Permissões

Somente `scripting`, `storage` e `webRequest`.

Hosts somente:

- domínio oficial do NFe Agendamento;
- `https://www.nfe.fazenda.gov.br/*`.

Sem `<all_urls>`, Native Messaging, `downloads`, `webRequestBlocking` ou acesso genérico ao disco.

## Fluxo

1. site valida chave e faz handshake;
2. extensão abre popup oficial;
3. chave é preenchida;
4. usuário resolve hCaptcha;
5. extensão continua a consulta;
6. navegador usa A1 quando solicitado;
7. extensão observa a requisição oficial de `downloadNFe.aspx`;
8. XML é obtido pela mesma sessão, limitado e validado;
9. XML volta ao site;
10. site valida novamente e renderiza DANFE.

## Confiabilidade

A 0.2.5 mantém o hardening da 0.2.4 e altera a captura final do XML: a requisição oficial observada por `webRequest` é serializada e reproduzida por `chrome.scripting.executeScript` dentro da própria aba do Portal, preservando o contexto de sessão do navegador sem adicionar permissões.

A 0.2.4 já incluía:

- estado em `chrome.storage.session`;
- reconciliação após cold start;
- `start` idempotente;
- mutações serializadas;
- claim único da captura XML;
- finalização protegida contra cancelamento concorrente;
- `stateChangedAt` para preservar timeouts entre navegações;
- observação reativa do DOM com fallback periódico;
- erros distintos para sessão/HTTP/XML;
- captura fechada ao endpoint oficial.

## Segurança

- hCaptcha manual;
- sem PFX/P12/senha/chave privada na extensão;
- XML máximo de 10 MiB;
- DTD rejeitado;
- XML deve conter `nfeProc` e a chave consultada;
- configuração privada de fornecedor permanece local.

## Aceitação

Usar `docs/testing/acceptance.md`.
