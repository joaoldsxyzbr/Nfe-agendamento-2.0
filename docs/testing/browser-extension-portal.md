# Extensão Chromium — Portal Nacional

## Arquitetura

```text
Site
 ↓
Extensão Chromium
 ↓
Portal Nacional
 ↓
hCaptcha manual
 ↓
XML oficial
```

Não existe Bridge, WebView2 helper, Native Messaging ou consulta direta `NFeDistribuicaoDFe`.

## Configuração inicial

1. instalar/carregar a extensão;
2. abrir o site;
3. confirmar **Extensão conectada**;
4. opcionalmente clicar no ícone da extensão para importar regras privadas de fornecedor.

Não existe configuração de CNPJ do A1.

## Consulta

A extensão abre:

`https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx`

Fluxo:

1. o site envia somente a chave validada;
2. a extensão cria um popup real do Chrome/Edge;
3. o content script reconhece a página oficial e preenche a chave;
4. o usuário resolve o hCaptcha manualmente;
5. a extensão continua somente após a resposta válida do captcha;
6. o download oficial é acompanhado pela extensão;
7. o XML é obtido dentro da própria sessão autenticada;
8. o payload é validado contra a chave consultada;
9. o XML retorna ao site.

## Certificado

Se o Portal exigir certificado digital durante o download, Chrome/Edge e Windows cuidam da autenticação. A extensão não lê PFX/P12, senha ou chave privada.

## Hardening

- popup restrito ao host oficial;
- lifecycle em `chrome.storage.session`;
- uma operação ativa;
- captura única do download;
- replay do request dentro da própria aba autenticada;
- XML máximo de 10 MiB;
- DTD proibido;
- chave do XML deve coincidir com a chave consultada;
- hCaptcha nunca é executado/fabricado pela extensão.

## Permissões/hosts

Permissões: `scripting`, `storage`, `webRequest`.

Hosts: site oficial e `www.nfe.fazenda.gov.br`.

Não existe permissão para `www1.nfe.fazenda.gov.br`.

## Gate físico

Validar no Windows real:

- popup;
- preenchimento da chave;
- hCaptcha manual;
- certificado quando solicitado;
- captura do XML;
- segunda consulta;
- cancelamento;
- Chrome e Edge.
