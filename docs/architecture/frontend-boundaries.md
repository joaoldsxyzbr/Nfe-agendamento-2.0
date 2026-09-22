# Fronteiras do frontend

**Estado atual: arquitetura extension-only.**

O frontend é um site Vite + TypeScript. Toda consulta de NF-e depende exclusivamente da extensão Chromium MV3 e do Portal Nacional.

## Composition root

`apps/web/src/main.ts` compõe:

- consulta unitária;
- lote sequencial;
- cliente da extensão;
- parser XML;
- regras de apresentação;
- visualizador DANFE;
- download de XML/ZIP;
- diagnóstico simples da extensão.

Não existe cliente HTTP local, seleção de certificado ou código de atualização Windows.

## Limites

### Site

Responsável por:

- validar chave;
- apresentar estado da consulta;
- parsear e validar XML;
- resolver apresentação de fornecedor a partir do `supplierId` retornado pela extensão;
- DANFE, impressão/PDF, XML e ZIP;
- manter lote sequencial.

### Extensão

Responsável por:

- handshake com o site;
- abrir e acompanhar o Portal Nacional;
- preencher a chave;
- aguardar hCaptcha humano;
- acionar apenas controles oficiais conhecidos;
- observar/reproduzir com segurança somente a requisição oficial de XML;
- guardar regras privadas de fornecedor em `chrome.storage.local`.

### Navegador/Windows

Responsável pela autenticação TLS com certificado A1 quando o Portal solicitar. O projeto não acessa diretamente a chave privada.

### Cloudflare

Responsável por servir o site. Não recebe chave NF-e, XML, certificado ou identificadores privados de fornecedor por causa do fluxo de consulta.

## Contratos

Os contratos genéricos do Portal ficam em `apps/web/src/portal/contracts.ts`. Eles não pertencem mais a um módulo Windows.

O cliente principal é `BrowserPortalExtensionClient`.

## Invariantes

- nenhum runtime web referencia `127.0.0.1:17345`;
- nenhum runtime web instancia `BridgeClient`;
- nenhuma consulta usa `lookupNfe`/SEFAZ direta;
- no máximo uma operação Portal por vez no lote;
- hCaptcha permanece manual;
- falha do Portal não abre uma segunda rota automaticamente.
