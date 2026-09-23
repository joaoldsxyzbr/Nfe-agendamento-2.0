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

A v0.0.34/extensão 0.2.11 consolidou a migração Portal-only. A `main` atual prepara a v0.0.35/extensão 0.2.12 com otimizações de fluidez, mantendo o mesmo fluxo fiscal.
