# Regras declarativas de fornecedores

As regras de apresentação específicas por fornecedor ficam centralizadas em `apps/web/src/nfe/supplier-rules.ts`.

## Objetivo

Evitar espalhar CPF/CNPJ, catálogos e fatores de conversão por diferentes partes do DANFE. O renderizador continua recebendo apenas o resultado resolvido e não conhece fornecedores específicos.

## Estrutura atual

Cada fornecedor pode declarar:

- `id` e nome legível;
- um ou mais CPF/CNPJ normalizados em `taxIds`;
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

Aliases conflitantes continuam sendo rejeitados pelo validador do catálogo. CPF/CNPJ duplicado entre regras de fornecedores é rejeitado por `validateSupplierRules()`.

## Como adicionar um fornecedor

1. adicionar uma entrada em `SUPPLIER_RULES`;
2. reutilizar um catálogo existente ou declarar um novo catálogo quando necessário;
3. adicionar apenas as capacidades aplicáveis (`productCatalog` e/ou `internalQuantity`);
4. criar ou atualizar testes antes de usar a regra no DANFE;
5. atualizar esta documentação e a referência visual do DANFE.

Não adicionar condicionais por nome de fornecedor dentro de `render.ts`. Regras novas devem entrar pelo resolvedor declarativo para preservar previsibilidade e testabilidade.

## Testes

Os contratos principais ficam em:

- `apps/web/tests/supplier-rules.test.ts`;
- `apps/web/tests/product-mapping.test.ts`;
- `apps/web/tests/supplier-quantity.test.ts`;
- `apps/web/tests/supplier-quantity-render.test.ts`.
