# Fronteiras do frontend

**Estado atual: site + extensão Chromium, Portal-only, sem Bridge e sem consulta direta à SEFAZ.**

## Fluxo

```text
Site
 ↓
Extensão
 ↓
Portal Nacional
 ↓
hCaptcha manual
 ↓
XML oficial
 ↓
Site / DANFE
```

## Site

Responsável por:

- validar chave;
- orquestrar consulta unitária e lote;
- iniciar/cancelar operações do Portal pela extensão;
- parsear e validar novamente o XML recebido;
- gerar DANFE, impressão/PDF, XML e ZIP;
- resolver apresentação a partir do `supplierId`.

O site não acessa localhost, certificado ou endpoint fiscal da SEFAZ diretamente.

### Fluidez

- o handshake com a extensão é coalescido quando chamadas simultâneas acontecem e o estado conectado possui cache curto de 2 segundos;
- eventos `bridge_ready` invalidam o cache para forçar reconciliação;
- a entrada do lote usa debounce curto de 120 ms;
- linhas do lote são preservadas no DOM quando as chaves não mudam; durante a execução somente o item alterado e os controles necessários são atualizados;
- o lote continua estritamente sequencial e nenhuma dessas otimizações altera Portal, hCaptcha, XML ou DANFE.

## Extensão

Responsável por:

- handshake com o site;
- abrir e acompanhar o popup oficial do Portal;
- preencher a chave;
- manter o hCaptcha humano;
- acompanhar a continuação/download oficial;
- capturar e validar o XML antes do handoff;
- guardar regras privadas de fornecedor localmente.

A extensão não implementa `NFeDistribuicaoDFe`, não mantém CNPJ fiscal para consulta direta e não possui rota `direct_lookup`.

## Navegador/Windows

Responsável pelo certificado digital quando o Portal exigir autenticação. O projeto não recebe PFX/P12, senha ou chave privada.

## Cloudflare

Responsável por servir o site. Não é intermediário da consulta fiscal atual.

## Invariantes

- não existe `BridgeClient` nem `127.0.0.1:17345`;
- não existe consulta direta à SEFAZ;
- toda chave é processada pelo Portal Nacional;
- lote é sequencial;
- no máximo uma operação Portal fica ativa;
- hCaptcha é manual;
- XML deve corresponder à chave consultada;
- falhas não disparam outra rota escondida.
