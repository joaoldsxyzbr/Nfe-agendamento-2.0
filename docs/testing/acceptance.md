# Aceitação física — NFe Agendamento direct-first

## Pré-requisitos

- Windows 10/11;
- Chrome ou Edge;
- extensão 0.2.6 ou superior;
- certificado A1 válido instalado;
- CNPJ do A1 configurado nas opções da extensão;
- site oficial do NFe Agendamento.

## 1. Diagnóstico

1. confirmar **Extensão conectada**;
2. confirmar **Consulta direta: Configurada**;
3. desabilitar/reabilitar a extensão e validar recuperação.

## 2. Consulta direta

Usar uma NF-e que possa retornar XML pelo `NFeDistribuicaoDFe`:

1. informar a chave;
2. iniciar consulta;
3. confirmar indicação de rota **SEFAZ**;
4. selecionar/autorizar o A1 no Chrome/Edge caso solicitado;
5. confirmar que **nenhum popup do Portal abre**;
6. confirmar XML, DANFE e download.

Este é o gate mais importante da 0.2.6.

## 3. Fallback 217

Com um caso que resulte em 217:

1. confirmar tentativa direta primeiro;
2. confirmar abertura do Portal somente depois do 217;
3. resolver hCaptcha manualmente;
4. validar XML/DANFE.

## 4. Proteção 656/limite

Quando for possível validar sem provocar consumo indevido deliberadamente:

- confirmar que um limite já conhecido/local leva ao Portal;
- confirmar que a extensão não insiste na SEFAZ durante o cooldown;
- não gerar 656 propositalmente em produção.

## 5. Lote

Com pelo menos duas chaves:

- processamento sequencial;
- sucesso direto não abre Portal;
- 217 manda apenas aquele item ao Portal e a próxima volta à SEFAZ;
- quando a proteção de consumo estiver ativa, restantes seguem pelo Portal;
- nunca dois popups Portal simultâneos;
- cancelamento impede novos itens.

## 6. Erro de transporte

Simular apenas quando seguro:

- timeout/falha direta deve aparecer como erro;
- não pode haver retry automático;
- não pode abrir Portal escondido.

## 7. Chrome e Edge

Validar pelo menos uma consulta direta completa em cada navegador.

## Critério de aceite

- CI e CodeQL verdes;
- consulta direta real com A1 aprovada;
- XML/DANFE aprovados;
- fallback 217 aprovado quando houver caso disponível;
- lote sequencial aprovado;
- Chrome e Edge aprovados.

O hCaptcha permanece manual.
