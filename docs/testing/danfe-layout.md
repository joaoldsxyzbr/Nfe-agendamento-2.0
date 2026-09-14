# DANFE — referência visual e critérios de layout

Este documento registra o estado visual aprovado do DANFE em 14/09/2026, após comparação com uma impressão do FSist, com o mockup visual aprovado durante a revisão do projeto e com validações reais em PDFs gerados pelo NFe Agendamento.

## Objetivo

Manter a eficiência de espaço do NFe Agendamento, mas com leitura e acabamento visual mais próximos do DANFE tradicional: tipografia maior, hierarquia mais clara, blocos melhor proporcionados e tabela sem aparência comprimida.

O alvo visual não é copiar o FSist literalmente. A referência aprovada combina a leitura confortável do FSist com a compactação que já existia no NFe Agendamento.

## Ajustes implementados

- canhoto de recebimento levemente maior e mais legível;
- cabeçalho principal com proporção mais equilibrada entre emitente, identificação DANFE e chave de acesso;
- emitente alinhado à esquerda, com razão social em maior destaque e endereço/telefone mais fáceis de ler;
- título **DANFE**, entrada/saída, número, série, folha, chave e protocolo com hierarquia visual reforçada;
- texto de consulta de autenticidade no Portal Nacional preservado abaixo da chave;
- telefone/fax do emitente mostrado no cabeçalho quando existir no XML;
- blocos fiscais com rótulos menores que os valores, mantendo leitura rápida sem desperdiçar altura;
- destinatário/remetente reorganizado em grade de 12 colunas para manter nome, documento, datas, endereço, município, UF e inscrição estadual nas proporções corretas;
- transportador/volumes reorganizado em grade de 12 colunas, evitando campos excessivamente estreitos e mantendo três linhas semânticas claras;
- bloco **Transportador / Volumes transportados** é omitido quando o XML informa apenas `modFrete=9` (**Sem Transporte**) e não há transportadora, veículo nem volumes com dados úteis;
- totais fiscais mantidos compactos, com valores alinhados à direita e total da nota com destaque maior;
- área de **Dados adicionais** mantida ampla, com melhor proporção entre informações complementares e reservado ao fisco;
- linhas reais da tabela de produtos mantêm a altura natural e não são esticadas artificialmente;
- quando sobrar espaço vertical em uma NF-e curta, uma linha vazia de preenchimento mantém a grade das colunas até **Dados adicionais**, aproximando o acabamento do DANFE tradicional sem alterar os produtos reais;
- rodapé fica ancorado no fim da página;
- tipografia do preview e da impressão aumentada de forma controlada, principalmente em emitente, valores fiscais e produtos;
- espaçamento vertical e padding de células ajustados para aproximar o acabamento do mockup aprovado sem perder densidade;
- impressão A4 continua independente do zoom da tela;
- `vICMSUFDest` exibido como **V. ICMS UF dest.** quando a tag existir;
- `vTotTrib` exibido como **V. tot. trib.** quando a tag existir;
- composição de embalagem exibida abaixo da descrição do item quando `uCom/qCom` e `uTrib/qTrib` permitem determinar uma relação inteira, por exemplo **CX C/ 20 UN**;
- a tabela de produtos permanece com 13 colunas: **NCM/SH**, **Valor IPI** e **Alíq. IPI** continuam fora da grade para preservar largura para os dados operacionais mais úteis;
- a remoção dessas três colunas continua sendo apenas visual: os dados fiscais permanecem preservados no XML e nos totais fiscais.

## Validação real de 14/09/2026

Dois PDFs reais foram usados para conferir o comportamento após o refinamento visual:

- **SRC Manufaturados, 6 itens:** confirmou boa legibilidade e mostrou que uma NF-e curta deixava uma área branca grande abaixo da tabela; a grade vazia de preenchimento foi adotada para aproveitar esse espaço sem esticar a última mercadoria. Esse mesmo PDF mostrou `9-Sem Transporte` sem qualquer dado útil, caso que agora omite integralmente o bloco de transporte;
- **Souza Cruz, 14 itens:** confirmou que a tabela compacta continua acomodando muitos itens em uma única A4, preservando as quantidades internas entre colchetes e os dados adicionais. Como havia volumes e pesos reais, o bloco de transportador/volumes continua sendo exibido normalmente.

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
- emitente alinhado à esquerda com hierarquia visual clara;
- preview e impressão com tipografia confortável sem herdar o zoom da tela;
- coluna inicial **Item**;
- tabela de produtos mantém 13 colunas e não reintroduz **NCM/SH**, **Valor IPI** ou **Alíq. IPI**;
- linhas reais dos produtos não são esticadas; o espaço restante, quando existir, é absorvido somente pela linha vazia de preenchimento;
- a linha vazia preserva as divisórias das 13 colunas até o bloco seguinte;
- `modFrete=9` isolado, sem transportadora, veículo ou volumes úteis, não exibe o bloco de transporte;
- transporte continua visível quando houver qualquer informação útil além do modo de frete;
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
- ausência das colunas **NCM/SH**, **Valor IPI** e **Alíq. IPI** na grade de produtos;
- presença das colunas operacionais principais, incluindo descrição, quantidade, valor unitário, valor total e ICMS;
- omissão de transporte sem informação útil;
- omissão explícita de `9-Sem Transporte` quando todos os demais campos de transporte estão vazios;
- presença da linha vazia de preenchimento da grade de produtos;
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
- largura A4 e padding de impressão;
- proporção maior do cabeçalho principal;
- grade de 12 colunas de destinatário e transportador;
- emitente alinhado à esquerda;
- tipografia reforçada da impressão;
- preenchimento do espaço livre pela linha vazia, nunca pela última linha real do produto.

## Aceitação visual física

Ao validar em navegador/Windows real:

1. confirmar que a aparência geral corresponde ao mockup aprovado: cabeçalho equilibrado, texto maior e blocos com mais respiro;
2. confirmar que razão social do emitente, número da NF-e, série, chave e protocolo podem ser identificados rapidamente;
3. conferir destinatário/remetente e transportador para garantir que os campos não ficaram excessivamente estreitos;
4. conferir uma NF-e com poucos itens e confirmar que as linhas reais mantêm altura normal e a grade vazia ocupa o espaço restante até **Dados adicionais**;
5. conferir uma NF-e com muitos itens e confirmar que a paginação continua correta, sem corte de linhas;
6. conferir Dados adicionais e reservado ao fisco sem sobreposição ou invasão do rodapé;
7. conferir `9-Sem Transporte` sem outros dados e confirmar que o bloco é omitido; conferir também uma NF-e com volumes/pesos reais e confirmar que o bloco permanece;
8. conferir uma NF-e que contenha `vICMSUFDest` e/ou `vTotTrib`;
9. imprimir/salvar em PDF A4 e confirmar que não há corte de campos nem criação desnecessária de página adicional;
10. na impressão física, confirmar que rótulos fiscais, valores e linhas da tabela de produtos podem ser lidos confortavelmente sem zoom ou aproximação excessiva;
11. validar uma NF-e de Fernando Klein e uma de Dionisio e confirmar `cProd` na primeira linha + `[código interno]` abaixo, incluindo `ALECRIM → 104144` e `COUVE FOLHA → 104107`;
12. validar uma NF-e Souza Cruz e confirmar que a quantidade fiscal continua visível e a linha `[<unidades> UN]` aparece somente quando a conversão for válida.
