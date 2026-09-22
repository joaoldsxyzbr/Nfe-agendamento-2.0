# Tela de consulta

Estado atual da interface principal do NFe Agendamento 2.0 na `main`.

## Cabeçalho

O cabeçalho é compacto e usa dois grupos:

- à esquerda: logo, nome **NF-e Agendamento** e descrição curta;
- à direita: status da extensão, seta de download e configurações.

Os três controles da direita ficam no mesmo bloco visual, com altura padronizada e espaçamento curto. Em telas estreitas, o bloco quebra para uma segunda linha sem separar os controles entre si.

A seta baixa sempre o asset estável `NFeAgendamento-Extension.zip` da release mais recente.

## Identidade visual

A mesma marca é usada no site e na extensão:

- site: `apps/web/public/brand-mark.png`;
- extensão: `apps/extension/icon.png`;
- favicon do site: `apps/web/public/favicon.ico`.

O manifest da extensão usa o ícone para Chrome/Edge e a página de opções também exibe a marca.

## Consulta

O site aceita uma ou várias chaves NF-e e processa cada operação pelo Portal Nacional através da extensão.

Fluxo:

1. validação local da chave;
2. handshake com a extensão;
3. popup oficial do Portal;
4. hCaptcha manual;
5. certificado A1 tratado pelo Chrome/Edge e Windows;
6. captura do XML na própria sessão autenticada do Portal;
7. validação do XML;
8. visualização DANFE e download XML.

O lote permanece sequencial: existe no máximo uma operação Portal ativa.

## Estados importantes

- **Extensão conectada · vX.Y.Z**;
- **Extensão não conectada**;
- consulta em andamento;
- erro do Portal;
- consulta concluída;
- cancelamento.

## Segurança

O site não lê certificado, PFX/P12, senha ou chave privada. O hCaptcha não é automatizado. A extensão restringe o fluxo aos hosts oficiais configurados no manifest.
