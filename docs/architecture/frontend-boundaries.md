# Fronteiras do frontend

**Estado atual: site + extensão Chromium, sem Bridge.**

## Fluxo

```text
Site → extensão → SEFAZ direta
                    │
                    ├─ XML: conclui
                    ├─ 217: Portal para aquela NF-e
                    └─ 656/429/limite: Portal para atual + restantes do lote
```

## Site

Responsável por:

- validar chave;
- orquestrar consulta unitária e lote;
- aplicar as regras de roteamento a partir do resultado tipado da extensão;
- parsear/validar XML novamente;
- DANFE, impressão/PDF, XML e ZIP;
- resolver apresentação a partir do `supplierId`.

O site não acessa localhost, certificado ou endpoint fiscal diretamente.

## Extensão

Responsável por:

- handshake com o site;
- consulta `NFeDistribuicaoDFe`;
- montar SOAP `consChNFe`;
- proteção local de consumo;
- armazenar localmente o CNPJ do A1;
- abrir e acompanhar o Portal somente como fallback;
- manter hCaptcha humano;
- capturar/validar o XML oficial;
- guardar regras privadas de fornecedor.

## Navegador/Windows

Responsável pela autenticação TLS com certificado A1. O projeto não recebe PFX/P12, senha ou chave privada.

## Cloudflare

Responsável por servir o site. Não é intermediário da consulta fiscal atual.

## Invariantes

- não existe `BridgeClient` nem `127.0.0.1:17345`;
- consulta direta vem antes do Portal;
- 217 não muda permanentemente a rota do lote;
- 656/429/limite local muda o restante do lote para Portal;
- falha ambígua de transporte não é repetida nem convertida em Portal automaticamente;
- lote é sequencial;
- hCaptcha é manual;
- no máximo uma operação Portal fica ativa.
