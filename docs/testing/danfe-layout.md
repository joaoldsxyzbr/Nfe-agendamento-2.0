# DANFE — referência visual, conformidade e regressão

Este documento registra os critérios vigentes do DANFE do NFe Agendamento após a revisão fiscal de 15/09/2026.

## Objetivo

Manter o DANFE rápido, legível e compacto sem divergir dos campos mínimos do leiaute fiscal nem repetir a regressão de impressão que chegou a gerar praticamente um produto por folha.

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

## Colunas de produtos

A grade mantém a ordem fiscal e inclui novamente **NCM/SH**. A coluna operacional **Item** continua existindo, mas fica imediatamente à direita da descrição, como coluna específica da empresa.

Ordem atual:

1. Código produto;
2. Descrição do produto / serviço;
3. Item;
4. NCM/SH;
5. O/CST;
6. CFOP;
7. UN;
8. Quant.;
9. Valor unit.;
10. Valor total;
11. Valor desc.;
12. B.Cálc ICMS;
13. Valor ICMS;
14. Alíq. ICMS.

`Valor IPI` e `Alíq. IPI` continuam fora da grade principal quando não forem necessários; os dados permanecem preservados no XML e nos totais.

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

## Paginação física

A paginação de impressão continua determinística. Ela não usa `getBoundingClientRect()` nem `getComputedStyle()` durante `beforeprint`, pois o Chromium pode disparar o evento antes de aplicar completamente `@media print`.

A estimativa considera:

- largura menor da descrição após a volta de NCM/SH;
- descrição do produto;
- composição de embalagem;
- observação tributária;
- código interno;
- quantidade interna.

As folhas de continuação possuem orçamento vertical menor porque agora repetem Natureza da Operação e identificação fiscal do emitente. A `products-filler` é preservada em todas as folhas geradas dinamicamente.

## Regras por fornecedor

Identificação de fornecedor, códigos internos e conversões operacionais permanecem centralizados nas regras de fornecedor. O renderer recebe apenas o resultado dessas regras e preserva `cProd`, `qCom`, valores e XML originais.

## Testes automatizados

`apps/web/tests/danfe.test.ts` cobre, entre outros:

- presença das colunas fiscais principais e de NCM/SH;
- posição da coluna Item depois da descrição;
- omissão de IPI da grade quando não utilizado;
- repetição dos campos mínimos nas folhas adicionais;
- geração do código de barras híbrido para chave alfanumérica;
- preservação das letras na representação da chave;
- omissão de transporte sem dado útil;
- embalagem e regras operacionais já existentes;
- paginação determinística sem medição de viewport;
- preservação de `products-filler`;
- remoção do CSS morto `.danfe-measuring`;
- dimensões A4 e proporções do cabeçalho/tabela.

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

Conferir número de folhas, ordem dos itens, ausência de corte/duplicação, leitura do NCM, código de barras, `Folha X/Y`, cabeçalho obrigatório nas continuações e altura normal das linhas reais.

## Próxima camada de regressão

A fase seguinte adicionará Playwright pinado ao workspace/lockfile para gerar PDF A4 em Chromium no CI. Esse teste automatizado complementará, mas não substituirá, a validação em impressora física porque margens não imprimíveis e drivers variam por equipamento.
