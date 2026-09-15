# Regras declarativas de fornecedores

As regras de apresentação específicas por fornecedor ficam centralizadas em `apps/web/src/nfe/supplier-rules.ts`.

## Objetivo

Evitar espalhar identificação de fornecedor, catálogos e fatores de conversão por diferentes partes do DANFE. O renderizador continua recebendo apenas o resultado resolvido e não conhece fornecedores específicos.

## Privacidade e identificação

As regras públicas do frontend **não carregam CPF/CNPJ fixos de fornecedores**. A identificação das regras especiais usa o `xNome` do emitente presente no próprio XML da NF-e, com aliases explícitos e comparação exata após normalização.

A normalização:

- remove acentos;
- ignora diferenças entre maiúsculas/minúsculas;
- normaliza pontuação e espaços;
- não usa correspondência parcial.

A comparação exata é intencional para impedir que uma empresa com nome parecido receba uma transformação operacional indevida. CPF/CNPJ continuam sendo lidos do XML e exibidos nos campos fiscais normais do DANFE quando aplicável, mas não ficam embutidos como constantes de configuração no bundle público.

## Estrutura atual

Cada fornecedor pode declarar:

- `id` e nome legível;
- um ou mais nomes/aliases exatos em `issuerNames`;
- `productCatalog`, quando houver códigos internos por produto;
- `internalQuantity`, quando houver conversão operacional de quantidade.

Fornecedores sem uma determinada regra simplesmente não recebem aquela transformação de apresentação.

## Fornecedores configurados

### Fernando Klein

- usa o catálogo compartilhado de hortifruti;
- o `cProd` fiscal original permanece visível;
- o código interno é exibido abaixo, entre colchetes.

### Dionisio

- usa o mesmo catálogo compartilhado do Fernando Klein;
- mantém exatamente a mesma regra de preservação do `cProd` e apresentação do código interno.

### Souza Cruz

- não usa o catálogo de códigos internos de hortifruti;
- possui conversão declarativa de quantidade com multiplicador `50` e unidade operacional `UN`;
- a quantidade fiscal original continua preservada.

## Catálogo compartilhado

`GREEN_SUPPLIER_CATALOG` contém os 18 produtos/aliases atualmente aprovados. A normalização de descrição continua removendo acentos, diferenças de caixa e o prefixo `VERDURAS`, sem alterar o XML original.

Aliases conflitantes continuam sendo rejeitados pelo validador do catálogo. Nomes normalizados duplicados entre regras de fornecedores são rejeitados por `validateSupplierRules()`.

## Como adicionar um fornecedor

1. adicionar uma entrada em `SUPPLIER_RULES` com aliases exatos de `xNome` realmente observados;
2. reutilizar um catálogo existente ou declarar um novo catálogo quando necessário;
3. adicionar apenas as capacidades aplicáveis (`productCatalog` e/ou `internalQuantity`);
4. criar ou atualizar testes antes de usar a regra no DANFE;
5. atualizar esta documentação e a referência visual do DANFE.

Não adicionar CPF/CNPJ fixo ao frontend para reconhecer fornecedor e não adicionar condicionais por nome dentro de `render.ts`. Regras novas devem entrar pelo resolvedor declarativo para preservar privacidade, previsibilidade e testabilidade.

## Testes

Os contratos principais ficam em:

- `apps/web/tests/supplier-rules.test.ts`;
- `apps/web/tests/product-mapping.test.ts`;
- `apps/web/tests/supplier-quantity.test.ts`;
- `apps/web/tests/supplier-quantity-render.test.ts`.

A aceitação física deve confirmar o `xNome` real recebido nas NF-e dos fornecedores configurados. Se houver variação legítima, adicionar somente o alias exato necessário e cobri-lo por teste.
