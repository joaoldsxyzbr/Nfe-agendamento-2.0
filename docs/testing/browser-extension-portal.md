# Extensão Chromium — SEFAZ direta + Portal fallback

## Arquitetura

```text
Site
 ↓
Extensão 0.2.10
 ├─ NFeDistribuicaoDFe
 └─ Portal Nacional (fallback)
```

Não existe Bridge, WebView2 helper ou Native Messaging.

## Configuração inicial

1. instalar/carregar a extensão;
2. clicar no ícone **NFe Agendamento**;
3. informar uma vez o CNPJ da empresa vinculada ao certificado A1 usado naquele computador;
4. confirmar no site que a consulta direta aparece como configurada.

Se o usuário tentar consultar antes disso, o site solicita a abertura das opções da extensão automaticamente e não envia a consulta à SEFAZ. A extensão 0.2.10 preserva esse preflight; a 0.2.8+ continua reconhecida por compatibilidade. Versões anteriores orientam atualização ou abertura manual das opções.

O CNPJ fica em `chrome.storage.local`. O certificado e sua chave privada não são copiados para a extensão.

## Autenticação do A1

Na 0.2.9 a chamada direta era iniciada pelo service worker MV3. Esse contexto não possui uma aba associada para exibir o seletor de certificado cliente quando a escolha manual é necessária.

Na 0.2.10 o background cria uma janela interna da própria extensão e navega para `direct-lookup.html`. Somente um UUID de operação vai na URL; chave NF-e e CNPJ são entregues por mensagem interna depois que a página comprova o vínculo com a aba criada. O `fetch` da SEFAZ roda nessa página visível, permitindo ao Chrome/Edge usar o repositório de certificados do Windows e apresentar o seletor do A1 quando necessário.

A janela é fechada após o resultado. Fechar a janela manualmente encerra a tentativa sem retry automático. Nenhuma permissão nova foi adicionada.

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

É obrigatório validar em Windows real que a janela interna da extensão permite ao Chrome/Edge negociar o A1 corretamente com o endpoint direto. O CI valida o roteamento para esse contexto visível, mas não consegue provar a negociação TLS real com o certificado do Windows.
