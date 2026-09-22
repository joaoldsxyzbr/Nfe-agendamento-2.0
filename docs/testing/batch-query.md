# Consulta em lote — direto-first

## Contrato

O lote replica o roteamento do Bridge antigo usando somente a extensão:

- processamento estritamente sequencial;
- começa na SEFAZ;
- sucesso direto conclui com origem **SEFAZ**;
- `217` envia somente o item atual ao **Portal** e o item seguinte volta a tentar SEFAZ;
- `656`, HTTP 429 ou proteção local mudam a rota dos itens restantes para **Portal**;
- nenhum retry fiscal automático;
- no máximo uma operação Portal ativa;
- hCaptcha manual;
- cancelamento impede novos itens;
- ZIP e impressão usam somente itens concluídos.

A proteção local limita consultas diretas a 20 tentativas por hora por CNPJ. A antiga coordenação multi-PC do Bridge não faz parte da arquitetura atual.

A aceitação física fica em `docs/testing/acceptance.md`.
