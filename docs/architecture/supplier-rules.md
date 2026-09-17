# Regras declarativas de fornecedores

As regras de apresentação específicas por fornecedor ficam centralizadas no frontend em `apps/web/src/nfe/supplier-rules.ts`, enquanto a identificação primária por CNPJ/CPF fica restrita ao Bridge local.

## Objetivo

Evitar espalhar identificação de fornecedor, catálogos e fatores de conversão por diferentes partes do DANFE. O XML fiscal continua intacto e o renderizador recebe apenas uma identidade lógica opcional (`supplierRuleId`) para decidir quais melhorias operacionais de apresentação aplicar.

## Identificação primária no Bridge local

O site já extrai `issuer.taxId` do XML da NF-e. Depois de validar o XML, ele envia esse identificador somente ao Bridge local em:

```text
POST http://127.0.0.1:17345/api/v1/supplier/resolve
```

A requisição contém apenas o CNPJ/CPF do emitente e a resposta contém exatamente:

```json
{ "supplierId": "souza-cruz" }
```

ou:

```json
{ "supplierId": null }
```

O identificador fiscal não é enviado ao Worker, Durable Object ou qualquer outro componente Cloudflare. A rota usa a mesma proteção de Host/Origin do restante da API local e não registra o CNPJ/CPF em logs.

## Configuração local

Os CNPJs/CPFs reais ficam exclusivamente em cada computador, no arquivo:

```text
%LocalAppData%\NfeAgendamentoBridge\supplier-rules.json
```

Schema v1:

```json
{
  "version": 1,
  "suppliers": [
    { "id": "souza-cruz", "taxIds": ["00000000000000"] },
    { "id": "fernando-klein", "taxIds": ["11111111111"] },
    { "id": "dionisio", "taxIds": ["22222222222"] }
  ]
}
```

Os valores acima são apenas exemplos sintéticos. **CNPJ/CPF real de fornecedor não deve ser colocado em código, teste, documentação, issue, pull request, log ou bundle público.**

Um mesmo fornecedor pode ter mais de um `taxId`. A configuração local deve ser preservada nas atualizações normais do Bridge e, quando vários PCs precisarem das mesmas regras, o mesmo arquivo pode ser copiado manualmente entre eles.

## Normalização e falha segura

O Bridge remove somente a formatação conhecida (`.`, `/`, `-`) e espaços, converte letras para maiúsculas e preserva caracteres alfanuméricos. Qualquer outro símbolo torna o identificador inválido. São aceitos:

- CPF com 11 dígitos;
- CNPJ com 14 posições: as 12 primeiras podem ser alfanuméricas e os 2 dígitos verificadores finais devem ser numéricos.

Arquivo ausente, JSON inválido, versão desconhecida, regra incompleta, identificador inválido, conflito do mesmo `taxId` entre fornecedores ou erro de leitura resultam em `supplierId: null`. A identificação de fornecedor é **fail-soft**: jamais bloqueia consulta, download, DANFE, Portal ou dispara nova tentativa fiscal.

## Fallback temporário por nome

Durante a migração, o frontend resolve a regra nesta ordem:

1. `supplierRuleId` retornado pelo Bridge;
2. `xNome` do emitente, com comparação exata após normalização.

A normalização de `xNome` remove acentos, ignora caixa e normaliza pontuação/espaços. Não existe correspondência parcial.

Esse fallback preserva o comportamento atual em PCs ainda sem `supplier-rules.json`. Ele só deve ser removido em mudança separada, depois da validação física dos fornecedores reais.

## Estrutura das regras de apresentação

Cada fornecedor no frontend pode declarar:

- `id` e nome legível;
- `issuerNames`, usados somente como fallback temporário;
- `productCatalog`, quando houver códigos internos por produto;
- `internalQuantity`, quando houver conversão operacional de quantidade.

As regras públicas não contêm CNPJ/CPF fixos.

## Fornecedores configurados

### Fernando Klein

- usa o catálogo compartilhado de hortifruti;
- o `cProd` fiscal original permanece visível;
- o código interno é exibido abaixo, entre colchetes.

### Dionisio

- usa o mesmo catálogo compartilhado do Fernando Klein;
- mantém a mesma regra de preservação do `cProd` e apresentação do código interno;
- enquanto o fallback por `xNome` estiver ativo, aceita os nomes exatos normalizados `DIONISIO` e `DIONISIO KOCH`.

### Souza Cruz

- não usa o catálogo de códigos internos de hortifruti;
- possui conversão declarativa de quantidade com multiplicador `50` e unidade operacional `UN`;
- a quantidade fiscal original continua preservada e a quantidade operacional aparece apenas como complemento visual.

## Catálogo compartilhado

`GREEN_SUPPLIER_CATALOG` contém os 18 produtos/aliases aprovados. A resolução de produto foi generalizada para `resolveSupplierProduct`; o catálogo continua compartilhado entre Fernando Klein e Dionisio.

A normalização de descrição remove acentos, diferenças de caixa e o prefixo `VERDURAS`, sem alterar o XML original. Aliases conflitantes continuam sendo rejeitados pelo validador do catálogo e nomes normalizados duplicados entre regras são rejeitados por `validateSupplierRules()`.

## Como adicionar ou alterar um fornecedor

1. criar ou ajustar a regra declarativa em `SUPPLIER_RULES` somente com capacidades de apresentação necessárias;
2. adicionar o CNPJ/CPF real apenas ao `supplier-rules.json` local dos PCs que precisam reconhecer o fornecedor;
3. manter aliases de `xNome` somente enquanto o fallback estiver ativo;
4. criar ou atualizar testes usando identificadores sintéticos;
5. atualizar esta documentação;
6. validar uma NF-e real sem registrar o identificador fiscal no GitHub.

Não adicionar CNPJ/CPF real ao frontend, ao Worker, ao Durable Object ou a logs.

## Testes

Os contratos principais ficam em:

- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierIdentityResolverTests.cs`;
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/SupplierEndpointsIntegrationTests.cs`;
- `apps/web/tests/bridge-client.test.ts`;
- `apps/web/tests/supplier-rules.test.ts`;
- `apps/web/tests/product-mapping.test.ts`;
- `apps/web/tests/supplier-quantity.test.ts`;
- `apps/web/tests/supplier-quantity-render.test.ts`;
- `apps/web/tests/batch-controller.test.ts`.

Os testes automatizados usam apenas documentos sintéticos. A aceitação física deve confirmar, com uma NF-e real de cada fornecedor, que a regra visual correta foi aplicada e que o XML baixado continua exatamente o XML fiscal recebido. No GitHub deve ser registrado somente o resultado da validação, nunca o CNPJ/CPF real.
