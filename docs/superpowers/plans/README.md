# Status dos planos Superpowers

Este diretório preserva planos/specs históricos. Checkboxes antigos não representam automaticamente backlog atual.

## Fonte atual de verdade

1. `README.md`;
2. `docs/architecture/frontend-boundaries.md`;
3. `docs/testing/acceptance.md`;
4. `docs/testing/browser-extension-portal.md`;
5. testes automatizados do HEAD.

A migração de `2026-09-22-extension-only-migration.md` foi executada na arquitetura atual: o produto passou a **site + extensão Chromium**, sem Bridge/WebView2/SEFAZ direta.

## Histórico

Specs e planos anteriores que descrevem Bridge, instalador Windows, coordenador fiscal ou helper WebView2 permanecem somente como registro das versões em que esses componentes existiam.

A v0.0.25 é a última release híbrida histórica. A `main` atual é extension-only e usa extensão 0.2.4 até uma nova release ser explicitamente publicada.
