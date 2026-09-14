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
- bloco de transportador/volumes continua sendo omitido quando não houver informação útil e permanece compacto quando utilizado;
- impressão A4 usa tipografia própria mais legível que o preview, com reforço de tamanho/peso em rótulos, valores e tabela de produtos sem aplicar o zoom de tela;
- o padding de impressão foi reduzido de `4mm` para `3.5mm` para compensar o aumento tipográfico e preservar o encaixe físico na folha A4.

## Regras por fornecedor

CPF/CNPJ, catálogo compartilhado e conversões operacionais ficam centralizados em `apps/web/src/nfe/supplier-rules.ts`. O renderizador do DANFE não contém condicionais específicas por nome de fornecedor; ele recebe apenas o resultado já resolvido pelas regras de apresentação.

A configuração completa e o procedimento para novos fornecedores ficam em `docs/architecture/supplier-rules.md`.

## Códigos internos por fornecedor

O tratamento histórico do Fernando Klein continua preservado e é compartilhado com Dionisio. Os dois fornecedores usam o mesmo catálogo declarativo de apresentação, sem alterar o `cProd` fiscal do XML.

No DANFE, o código fiscal original continua na primeira linha e o código interno é mostrado abaixo em formato compacto entre colchetes, por exemplo `FK001` + `[73457]`. O prefixo antigo `Int.:` não é mais exibido.

O catálogo compartilhado contém os 17 produtos já existentes e também:

- **ALECRIM → `104144`**.

Aliases específicos de descrição também são normalizados sem alterar o XML original:

- **COUVE FOLHA → COUVE → `104107`**.

A identificação do fornecedor é feita pelo CPF/CNPJ normalizado do emitente. Emitentes não configurados não recebem código interno.

## Quantidade interna — Souza Cruz

Para o emitente **Souza Cruz**, a quantidade fiscal do item continua sendo exibida exatamente como veio na NF-e e recebe abaixo uma quantidade operacional em unidades. O CNPJ, multiplicador e unidade ficam declarados na regra do fornecedor.

A regra atual é **quantidade fiscal × 50**:

- `0,2` → `[10 UN]`;
- `0,4` → `[20 UN]`;
- `0,6` → `[30 UN]`;
- `1,0` → `[50 UN]`.

Essa conversão é exclusivamente de apresentação. O XML, `qCom`, valor unitário, valor total e demais campos fiscais não são alterados.

Para evitar inferências incorretas, a quantidade interna só é mostrada quando o emitente possui uma regra `internalQuantity`, a quantidade fiscal é positiva e o resultado da multiplicação é um número inteiro. Caso contrário, somente a quantidade fiscal é apresentada.

## Comportamentos que não podem regredir

- fonte Arial/Helvetica legível;
- DANFE A4;
- impressão A4 preserva tipografia reforçada sem herdar o zoom do preview;
- coluna inicial **Item**;
- código fiscal `cProd` preservado;
- Fernando Klein e Dionisio mostram o código interno entre colchetes abaixo do `cProd`, apenas na apresentação, sem alterar o XML original;
- o catálogo de códigos internos só se aplica aos emitentes explicitamente configurados;
- `COUVE FOLHA` deve ser apresentada com o código interno da `COUVE`, `104107`;
- Souza Cruz mantém a quantidade fiscal visível e mostra a quantidade interna apenas como complemento entre colchetes;
- a conversão de quantidade só se aplica aos emitentes com regra declarada e a resultados inteiros válidos;
- `Ctrl + scroll` aplica zoom somente ao DANFE no preview;
- impressão/PDF não utiliza o zoom de tela;
- paginação deve manter os itens na mesma folha quando houver espaço suficiente;
- informação de embalagem só aparece quando a própria NF-e fornece unidades comercial/tributável e quantidades suficientes para calcular uma relação inteira maior que 1;
- nenhum campo fiscal é inventado: os dados adicionais de totalização só aparecem quando as respectivas tags existem no XML.

## Testes automatizados

Os contratos principais ficam em `apps/web/tests/danfe.test.ts`, `apps/web/tests/supplier-rules.test.ts`, `apps/web/tests/product-mapping.test.ts`, `apps/web/tests/supplier-quantity.test.ts` e `apps/web/tests/supplier-quantity-render.test.ts`, incluindo:

- presença dos blocos fiscais;
- coluna Item antes do código do produto;
- omissão de transporte sem informação útil;
- validação das regras declarativas e dos CPF/CNPJ configurados;
- tratamento de códigos internos por fornecedor;
- catálogo compartilhado entre Fernando Klein e Dionisio;
- apresentação compacta do código interno como `[código]`, sem o prefixo `Int.:`;
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
- regras estruturais de A4 e compactação do CSS;
- regras específicas de legibilidade da impressão, incluindo padding A4 e tamanhos mínimos do texto fiscal e da tabela de produtos.

## Aceitação visual física

Ao validar em navegador/Windows real:

1. comparar o preview com uma NF-e conhecida e confirmar que chave, número, série e protocolo estão facilmente identificáveis;
2. confirmar que o cabeçalho ocupa menos espaço vertical que a versão anterior sem perder legibilidade;
3. conferir que Dados adicionais tem espaço suficiente para textos longos e não invade o rodapé;
4. conferir uma NF-e com e sem transportador;
5. conferir uma NF-e que contenha `vICMSUFDest` e/ou `vTotTrib`;
6. imprimir/salvar em PDF A4 e confirmar que não há corte de campos nem criação desnecessária de página adicional;
7. na impressão física, confirmar que rótulos fiscais, valores e linhas da tabela de produtos podem ser lidos confortavelmente sem zoom ou aproximação excessiva;
8. validar uma NF-e de Fernando Klein e uma de Dionisio e confirmar `cProd` na primeira linha + `[código interno]` abaixo, incluindo `ALECRIM → 104144` e `COUVE FOLHA → 104107`;
9. validar uma NF-e Souza Cruz e confirmar que a quantidade fiscal continua visível e a linha `[<unidades> UN]` aparece somente quando a conversão for válida.