# Extensão Chromium — SEFAZ direta + Portal fallback

## Arquitetura

```text
Site
 ↓
Extensão 0.2.7
 ├─ NFeDistribuicaoDFe
 └─ Portal Nacional (fallback)
```

Não existe Bridge, WebView2 helper ou Native Messaging.

## Configuração inicial

1. instalar/carregar a extensão;
2. clicar no ícone **NFe Agendamento**;
3. informar uma vez o CNPJ correspondente ao certificado A1 usado naquele computador;
4. confirmar no site que a consulta direta aparece como configurada.

O CNPJ fica em `chrome.storage.local`. O certificado e sua chave privada não são copiados para a extensão.

## Consulta direta

Endpoint:

`https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx`

Contrato preservado do antigo Bridge:

- POST SOAP;
- `distDFeInt` versão 1.01;
- ambiente 1;
- CNPJ configurado localmente;
- `consChNFe/chNFe`;
- timeout de 45 s;
- resposta/XML limitado a 10 MiB;
- `docZip` gzip;
- somente `procNFe` da chave solicitada é aceito.

## Fallback

- 138 + XML: sucesso direto;
- 217: Portal somente para a NF-e;
- 656/HTTP 429/limite local: Portal e cooldown;
- transporte/timeout/erro técnico: erro explícito, sem retry/fallback automático.

## Proteção local

- 20 tentativas diretas por hora;
- cooldown de 1 hora;
- estado persistido localmente.

A coordenação multi-PC antiga não está nesta versão.

## Portal

Permanece com o hardening da 0.2.5:

- popup real Chrome/Edge;
- hCaptcha manual;
- lifecycle em `chrome.storage.session`;
- captura única do download;
- replay dentro da própria aba autenticada;
- XML validado contra a chave.

## Permissões/hosts

Permissões: `scripting`, `storage`, `webRequest`.

Hosts: site oficial, Portal Nacional e endpoint `www1.nfe.fazenda.gov.br`.

## Gate físico

É obrigatório validar em Windows real que Chrome/Edge negocia o A1 corretamente quando o `fetch` da extensão chama o endpoint direto. Esse comportamento não é comprovável pelo CI.
