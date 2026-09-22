# Consulta em lote — Portal-only

O lote usa somente o Portal Nacional da NF-e.

## Preflight

Antes de iniciar, o site confirma que:

- a extensão está conectada;
- a capability `portalLookup` está disponível.

Não existe preflight de CNPJ/certificado para consulta direta.

## Processamento

Cada item segue o mesmo fluxo:

```text
chave
 ↓
Portal Nacional
 ↓
hCaptcha manual
 ↓
XML
 ↓
validação
```

O próximo item só começa depois que o anterior termina.

## Invariantes

- processamento estritamente sequencial;
- no máximo uma operação Portal ativa;
- hCaptcha manual em cada consulta que exigir;
- cancelamento impede novos itens;
- XML validado antes de sucesso;
- todos os itens concluídos usam origem `Portal`;
- ZIP/impressão usam somente concluídas;
- não existe rota SEFAZ, cooldown 656 ou retry fiscal automático.
