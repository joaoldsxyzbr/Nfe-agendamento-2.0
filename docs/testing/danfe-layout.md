# DANFE — referência visual e critérios de layout

Este documento registra o estado do DANFE após a comparação visual de 09/09/2026 com uma impressão do FSist gerada para a mesma NF-e.

## Objetivo

Manter a legibilidade e organização visual do NFe Agendamento, aproximando a densidade e a hierarquia fiscal do DANFE tradicional sem copiar integralmente o FSist.

## Ajustes implementados

- canhoto de recebimento mais compacto;
- cabeçalho emitente / DANFE / chave reduzido verticalmente;
- número, série, chave e protocolo preservados com hierarquia fiscal clara;
- texto de consulta de autenticidade no Portal Nacional abaixo da chave;
- telefone/fax do emitente mostrado no cabeçalho quando existir no XML;
- `vICMSUFDest` exibido como **V. ICMS UF dest.** quando a tag existir;
- `vTotTrib` exibido como **V. tot. trib.** quando a tag existir;
- grade de totais adaptada para acomodar os campos adicionais sem aumentar desnecessariamente a altura;
- área de **Dados adicionais** ampliada para melhorar a leitura das informações complementares;
- bloco de transportador/volumes continua sendo omitido quando não houver informação útil e permanece compacto quando utilizado.

## Comportamentos que não podem regredir

- fonte Arial/Helvetica legível;
- DANFE A4;
- coluna inicial **Item**;
- código fiscal `cProd` preservado;
- tratamento Fernando Klein mostra `Int.` apenas na apresentação e não altera o XML original;
- `Ctrl + scroll` aplica zoom somente ao DANFE no preview;
- impressão/PDF não utiliza o zoom de tela;
- paginação deve manter os itens na mesma folha quando houver espaço suficiente;
- nenhum campo fiscal é inventado: os dados adicionais de totalização só aparecem quando as respectivas tags existem no XML.

## Testes automatizados

Os contratos principais ficam em `apps/web/tests/danfe.test.ts`, incluindo:

- presença dos blocos fiscais;
- coluna Item antes do código do produto;
- omissão de transporte sem informação útil;
- tratamento Fernando Klein;
- texto de autenticidade e telefone do emitente;
- `vICMSUFDest` e `vTotTrib` quando presentes;
- limites do zoom;
- regras estruturais de A4 e compactação do CSS.

## Aceitação visual física

Ao validar em navegador/Windows real:

1. comparar o preview com uma NF-e conhecida e confirmar que chave, número, série e protocolo estão facilmente identificáveis;
2. confirmar que o cabeçalho ocupa menos espaço vertical que a versão anterior sem perder legibilidade;
3. conferir que Dados adicionais tem espaço suficiente para textos longos e não invade o rodapé;
4. conferir uma NF-e com e sem transportador;
5. conferir uma NF-e que contenha `vICMSUFDest` e/ou `vTotTrib`;
6. imprimir/salvar em PDF A4 e confirmar que não há corte de campos nem criação desnecessária de página adicional;
7. validar uma NF-e Fernando Klein e confirmar `cProd` + `Int.` corretamente.
