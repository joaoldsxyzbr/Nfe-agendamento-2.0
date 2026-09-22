# Zoom do preview do DANFE

## Comportamento esperado

No popup **Visualizar DANFE**, manter `Ctrl` pressionado e girar a roda do mouse deve ampliar ou reduzir somente as folhas do DANFE, preservando o zoom da página do navegador.

## Correção de 2026-09-09

Foi adicionado um listener diretamente no viewport `.danfe-scroll` por meio de `apps/web/src/danfe/zoom-direct.ts`. O listener usa `passive: false`, cancela o comportamento padrão do navegador, mantém o ponto sob o cursor durante o zoom e reutiliza os limites definidos por `nextDanfeZoom`.

O listener direto interrompe a propagação do evento para evitar execução duplicada pelo listener legado no modal.

## Aceitação física

1. consultar uma NF-e;
2. abrir **Visualizar DANFE**;
3. posicionar o cursor sobre a folha;
4. segurar `Ctrl` e girar a roda para cima e para baixo;
5. confirmar que somente o DANFE muda de escala;
6. confirmar que a rolagem continua funcional e o ponto sob o cursor permanece aproximadamente estável;
7. confirmar que **Imprimir / PDF** continua usando escala normal de impressão.
