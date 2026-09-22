# Consulta em lote — arquitetura extension-only

O lote consulta somente pelo Portal Nacional através da extensão.

## Contrato

- processamento estritamente sequencial;
- no máximo uma operação Portal ativa;
- hCaptcha manual para cada NF-e;
- nenhum retry fiscal automático;
- erro de um item não cria uma rota alternativa escondida;
- cancelamento impede o início dos itens restantes;
- XML de cada item é validado antes de marcar sucesso;
- ZIP e impressão usam somente itens concluídos.

A aceitação física fica em `docs/testing/acceptance.md`.
