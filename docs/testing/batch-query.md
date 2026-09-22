# Consulta em lote — direct-first

O lote reutiliza a lógica fiscal do antigo Bridge, executada pela extensão.

## Preflight

Antes de iniciar o lote, o site verifica a configuração fiscal da extensão.

Se o CNPJ do A1 não estiver configurado:

- a tela de opções da extensão é aberta automaticamente;
- nenhuma consulta é enviada à SEFAZ;
- nenhuma NF-e é marcada como erro;
- nenhuma NF-e é cancelada;
- o lote permanece aguardando nova tentativa após salvar o CNPJ.

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
