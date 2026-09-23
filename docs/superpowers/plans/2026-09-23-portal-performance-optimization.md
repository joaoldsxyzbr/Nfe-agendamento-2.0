# Otimização de fluidez Portal-only — 23/09/2026

## Escopo

Otimizar a v0.0.34 sem mudar arquitetura, regra fiscal, Portal, hCaptcha, parser XML ou DANFE.

## Alterações

1. Cache/index da configuração privada de fornecedor no service worker.
2. Invalidação por `chrome.storage.onChanged`.
3. Cache curto e coalescência do handshake site/extensão.
4. Índices das regras públicas de apresentação.
5. Debounce curto do rascunho de lote.
6. Render incremental das linhas do lote.
7. Reuso do formatador monetário.
8. Testes de regressão e documentação.

## Critérios

- nenhuma segunda rota fiscal;
- nenhuma concorrência nova no lote;
- nenhuma mudança no XML original;
- nenhuma exposição de identificadores fiscais privados;
- CI completo verde antes da publicação automática da release.
