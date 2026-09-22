# DANFE — referência visual, conformidade e regressão

Este documento registra os critérios vigentes do DANFE do NFe Agendamento, incluindo a restauração da grade de produtos aprovada em 14/09/2026 e mantida novamente a partir de 17/09/2026.

## Objetivo

Manter o DANFE rápido, legível e compacto sem repetir regressões de impressão ou de apresentação da grade de produtos.

O renderer continua próprio porque também atende regras operacionais internas de apresentação. Essas regras nunca alteram o XML fiscal original.

## Estrutura atual

- papel A4 em retrato;
- Arial/Helvetica no preview e na impressão;
- canhoto somente na primeira folha;
- cabeçalho com identificação do emitente, DANFE, entrada/saída, número, série, folha, chave, código de barras e protocolo;
- Natureza da Operação e identificação fiscal do emitente abaixo do cabeçalho;
- destinatário, cobrança/pagamento, totais, transporte útil, produtos e dados adicionais na primeira folha;
- bloco de transporte omitido quando existe apenas `modFrete=9` e nenhum dado útil de transportadora, veículo ou volume;
- grade de produtos com linha vazia `products-filler` para ocupar apenas o espaço restante, sem esticar mercadorias reais;
- zoom do preview por `Ctrl + scroll`, sem transferir zoom para impressão/PDF.

## Faixa intermediária — tradicional refinado

A faixa entre o cabeçalho fiscal e a grade de produtos segue o padrão **tradicional refinado**: continua com aparência de DANFE convencional, mas reduz subdivisões pequenas e melhora a hierarquia dos dados.

- **Destinatário / Remetente:** 11 células operacionais distribuídas em três linhas. Município/UF, IE/indicador e data/hora de saída são agrupados sem descartar nenhum valor do XML.
- **Fatura / Duplicata / Pagamento:** cobrança e pagamento compartilham uma única faixa externa; cada grupo mantém seu próprio título fiscal e os itens continuam individualizados.
- **Cálculo do imposto:** os valores são divididos em duas linhas explícitas. `V. total produtos` e `V. total da nota` recebem ênfase tipográfica, sem alterar os valores ou a origem dos dados.
- **Transportador / Volumes transportados:** o bloco usa duas linhas lógicas. Placa/UF, município/UF, quantidade/espécie, marca/numeração e pesos bruto/líquido são agrupados para reduzir fragmentação visual.
- **Grade de produtos:** permanece exatamente no contrato operacional de 13 colunas descrito abaixo.

A compactação libera espaço vertical na primeira folha. O orçamento determinístico de produtos da primeira página passa de **104 mm para 110 mm**; folhas adicionais continuam com 204 mm. O CI `danfe-print` continua sendo o gate para impedir overflow ou regressões A4.

## Colunas de produtos

A grade visual usa **13 colunas** e prioriza os dados operacionais usados no recebimento. A coluna **Item** é a primeira coluna. **NCM/SH**, **Valor IPI** e **Alíq. IPI** não são exibidos na grade principal; esses dados continuam preservados no XML/modelo fiscal e os totais do DANFE não são alterados.

Ordem vigente:

1. Item;
2. Código produto;
3. Descrição do produto / serviço;
4. O/CST;
5. CFOP;
6. UN;
7. Quant.;
8. Valor unit.;
9. Valor total;
10. Valor desc.;
11. B.Cálc ICMS;
12. Valor ICMS;
13. Alíq. ICMS.

A descrição reserva **62 mm**. `Item` reserva 8 mm e `Código produto` 20 mm. A largura liberada pela retirada visual do NCM/IPI é usada para melhorar a leitura da descrição e reduzir quebras desnecessárias.

## Folhas adicionais

Toda folha adicional repete no topo, antes dos produtos:

- identificação do emitente;
- DANFE e Documento Auxiliar da Nota Fiscal Eletrônica;
- entrada/saída, número, série e `Folha X/Y`;
- código de barras e Chave de Acesso;
- Natureza da Operação;
- Inscrição Estadual, IE do substituto tributário e CNPJ/CPF do emitente.

A paginação criada inicialmente pelo renderer e as folhas adicionais criadas no `beforeprint` seguem o mesmo contrato.

## Chave e código de barras alfanuméricos

O renderer aceita as chaves de 44 posições compatíveis com CNPJ alfanumérico. A representação textual preserva letras e números; nenhum `replace(/\D/g, '')` é usado para formatar a chave.

O código de barras segue o modelo híbrido previsto na NT Conjunta DFe 2025.001:

- começa em CODE-128C;
- pares numéricos permanecem em CODE-128C;
- ao encontrar caractere não numérico, alterna para CODE-128A;
- quando voltam a existir pares numéricos, retorna a CODE-128C;
- o dígito verificador da simbologia continua em módulo 103;
- a área do cabeçalho reserva aproximadamente 115 mm para o código de barras e mantém altura superior a 8 mm.

Chaves exclusivamente numéricas continuam produzindo o mesmo fluxo CODE-128C de antes.

## Contenção de campos longos

Campos textuais das células fiscais usam contenção explícita para não atravessar as bordas do DANFE. Valores comuns podem quebrar dentro da célula quando necessário; o campo **E-mail** permanece em uma única linha com `ellipsis` quando for maior que a largura disponível.

O teste Playwright inclui um destinatário com e-mail e demais campos longos para verificar que nenhuma célula do bloco **Destinatário / Remetente** ultrapassa seus próprios limites visuais.

## Paginação física

A paginação de impressão continua determinística. Ela não usa `getBoundingClientRect()` nem `getComputedStyle()` durante `beforeprint`, pois o Chromium pode disparar o evento antes de aplicar completamente `@media print`.

A estimativa considera:

- largura da descrição de 62 mm da grade simplificada;
- descrição do produto;
- composição de embalagem;
- observação tributária;
- código interno;
- quantidade interna.

As folhas de continuação possuem orçamento vertical menor porque repetem Natureza da Operação e identificação fiscal do emitente. A `products-filler` é preservada em todas as folhas geradas dinamicamente.

## Regras por fornecedor

Identificação de fornecedor, códigos internos e conversões operacionais permanecem centralizados nas regras de fornecedor. O renderer recebe apenas o resultado dessas regras e preserva `cProd`, `qCom`, valores e XML originais.

## Regressão corrigida em 17/09/2026

A revisão fiscal de 15/09/2026 havia reintroduzido `NCM/SH`, movido `Item` para depois da descrição e reduzido a descrição para 48 mm. Isso contrariava o layout operacional aprovado anteriormente.

A correção restaura apenas a grade de produtos e sua estimativa de largura. Permanecem intactas as melhorias posteriores de chave alfanumérica, CODE-128 híbrido, cabeçalhos das folhas adicionais, paginação determinística, impressão A4 e regras de fornecedores.

## Testes automatizados

`apps/web/tests/danfe.test.ts` e `apps/web/tests/danfe-product-table-regression.test.ts` cobrem, entre outros:

- `Item` como primeira coluna da grade;
- ausência visual de **NCM/SH**, **Valor IPI** e **Alíq. IPI**;
- presença das 13 colunas operacionais vigentes;
- descrição com 62 mm e ausência de `col.ncm` no CSS;
- repetição dos campos mínimos nas folhas adicionais;
- geração do código de barras híbrido para chave alfanumérica;
- preservação das letras na representação da chave;
- omissão de transporte sem dado útil;
- embalagem e regras operacionais já existentes;
- paginação determinística sem medição de viewport;
- preservação de `products-filler`;
- dimensões A4 e proporções do cabeçalho/tabela.

Além dos testes unitários, o CI possui o job **`danfe-print`** com Playwright em versão fixa. Ele instala somente Chromium, renderiza fixtures representativas, gera PDFs A4 reais pelo navegador e valida paginação, overflow, grade simplificada, cabeçalhos de continuação, `Folha X/Y` e chave alfanumérica. Os PDFs e resultados ficam disponíveis como artifact temporário do workflow para inspeção quando necessário.

## Aceitação física obrigatória

Antes de publicar nova release, validar em Windows/navegador real:

1. uma NF-e curta;
2. uma NF-e com muitos itens;
3. uma NF-e que force duas ou mais folhas;
4. uma NF-e com código/quantidade interna;
5. uma NF-e com transporte real e outra somente com `modFrete=9`;
6. uma chave alfanumérica de homologação, quando disponível ao certificado de teste;
7. impressão física e PDF A4;
8. lote com pelo menos duas NF-e.

Conferir número de folhas, ordem dos itens, ausência de corte/duplicação, **Item como primeira coluna**, ausência visual de NCM/IPI na grade, código de barras, `Folha X/Y`, cabeçalho obrigatório nas continuações e altura normal das linhas reais.

## Limite do teste automatizado

Playwright reduz fortemente o risco de regressão de layout no Chromium, mas não substitui a validação em impressora física. Margens não imprimíveis, escala automática e comportamento do driver continuam variando por equipamento, portanto a publicação de uma nova release ainda exige o checklist A4 real.
