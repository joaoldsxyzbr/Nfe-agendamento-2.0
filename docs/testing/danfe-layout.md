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
- composição de embalagem exibida abaixo da descrição do item quando `uCom/qCom` e `uTrib/qTrib` permitem determinar uma relação inteira, por exemplo **CX C/ 20 UN**;
- bloco de transportador/volumes continua sendo omitido quando não houver informação útil e permanece compacto quando utilizado.

## Códigos internos por fornecedor

O tratamento histórico do Fernando Klein continua preservado e agora é compartilhado com o fornecedor adicional configurado no mapeamento. Os dois fornecedores usam o mesmo catálogo de apresentação, sem alterar o `cProd` fiscal do XML.

O catálogo compartilhado contém os 17 produtos já existentes e também:

- **ALECRIM → `104144`**.

Aliases específicos de descrição também são normalizados sem alterar o XML original:

- **COUVE FOLHA → COUVE → `104107`**.

A identificação do fornecedor é feita pelo CPF/CNPJ normalizado do emitente. Emitentes não configurados não recebem código interno.

## Quantidade interna — Souza Cruz

Para o emitente **Souza Cruz**, identificado pelo CNPJ configurado no código, a quantidade fiscal do item continua sendo exibida exatamente como veio na NF-e e recebe abaixo uma quantidade operacional em unidades.

A regra é **quantidade fiscal × 50**:

- `0,2` → `Int.: 10 UN`;
- `0,4` → `Int.: 20 UN`;
- `0,6` → `Int.: 30 UN`;
- `1,0` → `Int.: 50 UN`.

Essa conversão é exclusivamente de apresentação. O XML, `qCom`, valor unitário, valor total e demais campos fiscais não são alterados.

Para evitar inferências incorretas, a quantidade interna só é mostrada quando o emitente é Souza Cruz, a quantidade fiscal é positiva e o resultado de `quantidade × 50` é um número inteiro. Caso contrário, somente a quantidade fiscal é apresentada.

## Comportamentos que não podem regredir

- fonte Arial/Helvetica legível;
- DANFE A4;
- coluna inicial **Item**;
- código fiscal `cProd` preservado;
- fornecedores configurados mostram `Int.` apenas na apresentação e não alteram o XML original;
- o catálogo de códigos internos só se aplica aos emitentes explicitamente configurados;
- `COUVE FOLHA` deve ser apresentada com o código interno da `COUVE`, `104107`;
- Souza Cruz mantém a quantidade fiscal visível e mostra a quantidade interna apenas como complemento;
- a conversão Souza Cruz não se aplica a outros emitentes nem a quantidades cujo resultado não seja inteiro;
- `Ctrl + scroll` aplica zoom somente ao DANFE no preview;
- impressão/PDF não utiliza o zoom de tela;
- paginação deve manter os itens na mesma folha quando houver espaço suficiente;
- informação de embalagem só aparece quando a própria NF-e fornece unidades comercial/tributável e quantidades suficientes para calcular uma relação inteira maior que 1;
- nenhum campo fiscal é inventado: os dados adicionais de totalização só aparecem quando as respectivas tags existem no XML.

## Testes automatizados

Os contratos principais ficam em `apps/web/tests/danfe.test.ts`, `apps/web/tests/product-mapping.test.ts`, `apps/web/tests/supplier-quantity.test.ts` e `apps/web/tests/supplier-quantity-render.test.ts`, incluindo:

- presença dos blocos fiscais;
- coluna Item antes do código do produto;
- omissão de transporte sem informação útil;
- tratamento de códigos internos por fornecedor;
- catálogo compartilhado entre os dois fornecedores configurados;
- `ALECRIM` mapeado para `104144`;
- `COUVE FOLHA` mapeado para `104107` nos dois fornecedores configurados;
- preservação do `cProd` original;
- Souza Cruz: `0,2 → 10 UN`, `0,4 → 20 UN` e `1,0 → 50 UN`;
- ausência da conversão Souza Cruz em outros emitentes;
- recusa de conversões inválidas ou não inteiras;
- preservação da quantidade fiscal e do XML original no DANFE;
- texto de autenticidade e telefone do emitente;
- `vICMSUFDest` e `vTotTrib` quando presentes;
- composição de embalagem derivada de `uCom/qCom` e `uTrib/qTrib`;
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
7. validar uma NF-e de cada fornecedor configurado e confirmar `cProd` + `Int.` corretamente, incluindo `ALECRIM → 104144` e `COUVE FOLHA → 104107`;
8. validar uma NF-e Souza Cruz e confirmar que a quantidade fiscal continua visível e a linha `Int.: <unidades> UN` aparece somente quando a conversão for válida.
