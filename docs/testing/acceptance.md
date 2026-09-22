# Aceitação física — NFe Agendamento direct-first

## Pré-requisitos

- Windows 10/11;
- Chrome ou Edge;
- extensão 0.2.10 ou superior;
- certificado A1 válido instalado;
- CNPJ da empresa vinculada ao A1 configurado nas opções da extensão;
- site oficial do NFe Agendamento.

## 1. Diagnóstico e preflight

1. confirmar **Extensão conectada**;
2. com o CNPJ fiscal ainda ausente, iniciar uma consulta;
3. confirmar que a página de opções da extensão abre automaticamente;
4. confirmar que nenhuma consulta é enviada à SEFAZ;
5. em lote, confirmar que os itens permanecem aguardando, sem erro/cancelamento;
6. durante o preflight, clicar rapidamente em **Consultar** mais de uma vez e confirmar que apenas uma verificação/início ocorre;
7. se houver resultado anterior concluído, forçar um preflight que termine sem iniciar lote e confirmar que ZIP/impressão continuam disponíveis;
8. se houver item anterior com erro de Portal, confirmar que **Tentar pelo Portal** fica bloqueado enquanto o preflight estiver pendente;
9. com uma extensão anterior à 0.2.8, confirmar orientação de atualização/configuração manual, sem afirmar que as opções foram abertas;
10. salvar o CNPJ e confirmar **Consulta direta: Configurada**;
11. desabilitar/reabilitar a extensão e validar recuperação.

## 2. Consulta direta

Usar uma NF-e que possa retornar XML pelo `NFeDistribuicaoDFe`:

1. informar a chave;
2. iniciar consulta;
3. confirmar indicação de rota **SEFAZ**;
4. confirmar que abre uma janela pequena **Autenticando certificado A1**;
5. se o Chrome/Edge exibir o seletor, escolher o A1 instalado no Windows;
6. confirmar que a janela interna fecha após a tentativa;
7. confirmar que **nenhum popup do Portal abre** quando a SEFAZ devolve o XML;
8. confirmar XML, DANFE e download.

Se o navegador estiver administrado com seleção automática de certificado cliente, o passo 5 pode ocorrer sem diálogo.

Este continua sendo o gate físico mais importante.

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
