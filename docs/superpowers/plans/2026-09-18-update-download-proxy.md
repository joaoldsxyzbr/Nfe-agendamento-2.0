# Corrigir atualização e download via domínio próprio — Implementation Plan

**Goal:** Remover a dependência direta do cliente em `api.github.com` e `github.com/releases/download`, fazendo site e updater usarem apenas `https://nfeagendamento.joaolds.xyz.br` para metadata e instalador.

**Architecture:** O Worker expõe duas rotas públicas e estritamente limitadas: `/api/update/latest` para metadata da release estável e `/downloads/windows/<tag>/<setup>` para streaming do Setup oficial. O Worker consulta o GitHub server-side, valida tag/nome/asset e nunca aceita URL arbitrária. O app preserva validação de tamanho e SHA-256 antes de executar o instalador.

**Constraints:** não alterar lógica fiscal, Bridge local, DANFE ou Portal; preservar validação SHA-256; sem proxy genérico/SSRF; documentação atualizada; release alvo `v0.0.16`.

## Task 1 — RED: contratos de atualização
- Adicionar teste do Worker para metadata, download, rejeição de caminho inválido e falha upstream.
- Atualizar testes do site para exigir URL do domínio próprio.
- Atualizar testes do updater para exigir metadata e asset no domínio próprio.
- Atualizar teste de deploy para exigir `run_worker_first` nas rotas de update.
- Confirmar CI vermelho pelas novas expectativas.

## Task 2 — GREEN: proxy seguro
- Criar `worker/update-proxy.ts`.
- Integrar o handler em `worker/index.ts`.
- Adicionar as rotas ao `wrangler.jsonc`.
- Apontar `settings-panel.ts`, `UpdateService.cs` e `UpdateRelease.cs` para o domínio oficial.
- Manter download em streaming e headers mínimos seguros.

## Task 3 — Release v0.0.16
- Bump `Directory.Build.props`.
- Atualizar README e arquitetura do updater.
- Criar `docs/releases/v0.0.16.md`.
- Commit marcador exato `release: v0.0.16`.
- Confirmar CI, CodeQL e workflow Release verdes.
- Verificar a release e, se o deploy Cloudflare já estiver publicado, testar os endpoints públicos.
