# Fronteiras do frontend

**Estado atual: site + extensão, consulta direta com Portal como fallback.**

## Fluxo

```text
Site
 ↓
Extensão
 ↓
NFeDistribuicaoDFe (SEFAZ)
 ├─ 138 + XML → site
 ├─ 217 → Portal somente para a NF-e atual
 └─ 656 / HTTP 429 / proteção local → Portal durante a janela de proteção
```

Não existe Bridge, localhost, helper WebView2 ou aplicação Windows.

## Site

Responsável por validar a chave, apresentar estados, parsear/validar XML, aplicar regras de apresentação, DANFE, downloads e manter o lote sequencial.

## Extensão

Responsável por:

- consulta direta ao endpoint oficial `NFeDistribuicaoDFe`;
- proteção fiscal local;
- Portal Nacional como fallback;
- hCaptcha sempre manual;
- captura/validação do XML do Portal;
- CNPJ fiscal e regras privadas em `chrome.storage.local`.

## Navegador/Windows

Responsável pela autenticação TLS cliente com o A1. O projeto não acessa PFX/P12, senha ou chave privada.

## Diferença em relação ao Bridge antigo

O roteamento fiscal foi restaurado:

- direto primeiro;
- `217` pontual para Portal;
- `656`/limite mudando a rota para Portal;
- sem retry fiscal automático.

A proteção compartilhada entre PCs do Bridge antigo não foi reintroduzida. A proteção da extensão é local por navegador/computador.

## Cloudflare

Serve somente o site. Não participa da consulta fiscal.

## Invariantes

- nenhum runtime usa `127.0.0.1:17345`;
- nenhum runtime instancia `BridgeClient`;
- consulta fiscal e lote são serializados;
- no máximo uma operação Portal ativa;
- hCaptcha permanece manual;
- transport/erro técnico da consulta direta não abre Portal automaticamente;
- Portal automático somente para `217` e proteção/limite de consumo.
