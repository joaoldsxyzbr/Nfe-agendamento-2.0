# Consulta em lote — direct-first

O lote reutiliza a lógica fiscal do antigo Bridge, executada pela extensão.

## Roteamento

Cada item começa pela consulta direta enquanto a rota estiver em SEFAZ:

- **sucesso**: conclui como origem `SEFAZ`;
- **217**: aquele item usa Portal e o próximo volta para SEFAZ;
- **656/429/limite local**: ativa rota Portal para o item atual e para os itens seguintes;
- **erro técnico/transporte**: item fica em erro; não há retry fiscal automático nem fallback escondido.

## Invariantes

- processamento estritamente sequencial;
- no máximo uma chamada direta por vez;
- no máximo uma operação Portal ativa;
- hCaptcha manual;
- cancelamento impede novos itens;
- XML validado antes de sucesso;
- ZIP/impressão usam somente concluídas.

Proteção local: 20 tentativas diretas/hora e cooldown de 1 hora.
