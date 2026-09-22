# Portal via extensão Chromium MV3

**Estado atual:** Portal Nacional é fallback da consulta direta.

## Arquitetura

```text
Site → extensão → NFeDistribuicaoDFe
                    ↓ fallback
               Portal Nacional → A1 via navegador/Windows
```

Não existe Bridge ou helper WebView2.

## Versão

A `main` usa extensão **0.2.6**. A release correspondente é a **v0.0.28**.

## Permissões

Somente `scripting`, `storage` e `webRequest`.

Hosts:

- domínio oficial do NFe Agendamento;
- `https://www.nfe.fazenda.gov.br/*`;
- `https://www1.nfe.fazenda.gov.br/*`.

## Quando o Portal abre

Automaticamente somente quando:

- consulta direta retorna `217`; ou
- a proteção fiscal está ativa por `656`, HTTP 429 ou limite local.

Falhas de transporte/técnicas não são repetidas nem desviadas automaticamente para outra rota.

## Fluxo Portal

1. extensão abre popup oficial;
2. chave é preenchida;
3. usuário resolve hCaptcha;
4. navegador usa A1 quando solicitado;
5. extensão observa `downloadNFe.aspx`;
6. a requisição é reproduzida dentro da sessão autenticada da aba;
7. XML é limitado e validado;
8. XML volta ao site.

## Confiabilidade

Mantém o hardening da 0.2.5:

- estado em `chrome.storage.session`;
- start idempotente;
- reconciliação após cold start;
- mutações serializadas;
- claim único do XML;
- proteção contra corrida de cancelamento;
- timeouts preservados entre navegações;
- captura restrita ao endpoint oficial.

## Segurança

- hCaptcha manual;
- sem PFX/P12/senha/chave privada;
- XML máximo de 10 MiB;
- DTD rejeitado;
- XML deve corresponder à chave;
- CNPJ fiscal e fornecedores ficam em storage local confiável.
