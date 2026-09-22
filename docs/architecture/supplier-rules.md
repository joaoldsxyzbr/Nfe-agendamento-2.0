# Regras de fornecedor

## Fronteira de privacidade

Identificadores fiscais reais de fornecedores ficam somente na extensão do navegador. Eles não devem entrar em código, documentação pública, fixtures, logs ou Cloudflare.

A extensão armazena a configuração em `chrome.storage.local` sob o schema v1 e restringe o storage a contextos confiáveis.

Exemplo sintético:

```json
{
  "version": 1,
  "suppliers": [
    { "id": "fornecedor-exemplo", "taxIds": ["00000000000000"] }
  ]
}
```

## Importação

A página de opções da extensão aceita um JSON escolhido explicitamente pelo usuário, valida o schema localmente e salva a forma canônica. O arquivo não é enviado por rede.

A extensão aceita o casing legado compatível já suportado na 0.2.x, rejeita ambiguidades e configuração inválida.

## Resolução

Depois de validar o XML, o site envia somente o identificador fiscal do emitente para o content bridge da extensão. A extensão compara localmente e devolve apenas:

```ts
{ supplierId: string | null }
```

Falha de configuração é fail-soft: `supplierId: null` nunca impede XML ou DANFE.

## Apresentação

As regras públicas de apresentação continuam em `apps/web/src/nfe/supplier-rules.ts`. Elas podem definir catálogo, aliases e conversões visuais, sem alterar o XML original.

## Testes

- `apps/extension/tests/supplier-store.test.ts`;
- `apps/extension/tests/options.test.ts`;
- `apps/web/tests/supplier-rules.test.ts`;
- `apps/web/tests/product-mapping.test.ts`;
- `apps/web/tests/supplier-quantity.test.ts`;
- `apps/web/tests/supplier-quantity-render.test.ts`;
- `apps/web/tests/batch-controller.test.ts`.

Testes usam somente identificadores sintéticos.
