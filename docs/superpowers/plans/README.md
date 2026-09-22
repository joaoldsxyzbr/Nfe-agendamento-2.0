# Status dos planos Superpowers

Este diretório preserva planos/specs históricos. Checkboxes antigos não representam automaticamente backlog atual.

## Fonte atual de verdade

1. `README.md`;
2. `docs/architecture/frontend-boundaries.md`;
3. `docs/testing/acceptance.md`;
4. `docs/testing/browser-extension-portal.md`;
5. testes automatizados do HEAD.

A arquitetura atual é **site + extensão Chromium, Portal-only**, sem Bridge/WebView2 e sem consulta direta à SEFAZ.

## Histórico

Specs e planos anteriores que descrevem Bridge, instalador Windows, coordenador fiscal, helper WebView2 ou `NFeDistribuicaoDFe` permanecem somente como registro das versões em que esses componentes existiam.

A última release publicada antes da migração Portal-only é a v0.0.33/extensão 0.2.10. A `main` atual usa extensão 0.2.11 e aguarda release explícita.
