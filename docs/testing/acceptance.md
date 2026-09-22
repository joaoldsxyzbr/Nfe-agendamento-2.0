# Aceitação física — NFe Agendamento Portal-only

## Pré-requisitos

- Windows 10/11;
- Chrome ou Edge;
- extensão compatível com Portal;
- site oficial do NFe Agendamento;
- certificado digital válido instalado quando o Portal exigir autenticação para download.

## 1. Integração

1. confirmar **Extensão conectada**;
2. confirmar **Portal Nacional: Disponível** nas configurações;
3. confirmar que não existe pedido de CNPJ do A1;
4. confirmar que não existe tentativa direta à SEFAZ.

## 2. Consulta unitária

1. informar uma chave válida;
2. clicar em **Consultar**;
3. confirmar abertura do popup oficial do Portal;
4. confirmar a chave preenchida;
5. resolver o hCaptcha manualmente;
6. deixar a extensão continuar o fluxo oficial;
7. usar/selecionar certificado digital se o Portal solicitar;
8. confirmar que o XML retorna ao site;
9. confirmar DANFE e download do XML;
10. confirmar que o popup fecha ao concluir.

## 3. Segunda consulta

Sem reiniciar navegador/extensão:

1. consultar outra NF-e;
2. confirmar novo popup sem estado residual;
3. resolver hCaptcha;
4. confirmar XML/DANFE normalmente.

## 4. Lote

Com pelo menos duas chaves:

- Portal abre uma NF-e por vez;
- nunca existem dois popups simultâneos;
- cada item concluído fica com origem **Portal**;
- ZIP usa apenas itens concluídos;
- impressão usa apenas itens concluídos.

## 5. Cancelamento

Durante uma operação:

1. cancelar o lote ou fechar a janela do Portal;
2. confirmar estado de cancelamento/erro explícito;
3. confirmar que nenhum próximo item começa depois de cancelamento do lote;
4. iniciar uma nova consulta e confirmar recuperação normal.

## 6. Falha do Portal

Quando houver falha real/controlada:

- não deve existir fallback para SEFAZ direta;
- não deve existir retry fiscal escondido;
- a recuperação manual por XML pode ser usada quando oferecida pelo site;
- XML importado manualmente continua validado contra a chave.

## 7. Chrome e Edge

Validar pelo menos uma consulta completa em cada navegador.

## Critério de aceite

- CI e CodeQL verdes;
- popup Portal aprovado;
- hCaptcha manual aprovado;
- certificado aprovado quando exigido;
- XML/DANFE aprovados;
- segunda consulta aprovada;
- lote sequencial aprovado;
- cancelamento aprovado;
- Chrome e Edge aprovados.

O hCaptcha permanece manual.
