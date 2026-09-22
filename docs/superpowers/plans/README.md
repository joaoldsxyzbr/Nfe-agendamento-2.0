# Status dos planos Superpowers

Este diretório preserva planos de implementação como **registro histórico** do desenvolvimento. Checkboxes não marcados em planos antigos não devem ser interpretados automaticamente como backlog atual: alguns passos foram substituídos por arquiteturas posteriores, outros dependiam de teste físico e outros foram concluídos em rodadas seguintes.

## Fonte atual de verdade

- hardening atual da extensão pós-pesquisa FSist: `2026-09-22-extension-hardening-fsist-research.md`;\n- migração planejada para arquitetura sem Bridge: `2026-09-22-extension-only-migration.md`;
- spec da arquitetura sem Bridge: `../specs/2026-09-22-extension-only-architecture-design.md`;

- estabilização/hardening concluído no código: `2026-09-09-stabilization-hardening-implementation.md`;
- arquitetura vigente: `../specs/2026-09-21-site-first-fiscal-agent-design.md` + `../../architecture/bridge-security.md`;
- pendências de validação física: `../../testing/acceptance.md`;
- release pública atual: `../../releases/v0.0.24.md`.

## Planos históricos/superseded

Os planos abaixo registram decisões e passos da época, mas não representam o backlog atual do projeto:

- `2026-09-08-nfe-agendamento-2-implementation.md` — bootstrap da reescrita;
- `2026-09-08-windows-installer-implementation.md` — implantação inicial do instalador;
- `2026-09-08-v0.0.4-reliability-implementation.md` — confiabilidade anterior às rodadas posteriores;
- `2026-09-09-persistent-portal-fallback-implementation.md` — primeira implantação do Portal persistente;
- `2026-09-09-project-hardening-completion.md` — hardening intermediário posteriormente absorvido pela estabilização final.

Quando houver conflito entre um plano histórico e o código/documentação atual, prevalecem a spec de estabilização, `README.md`, `docs/architecture/bridge-security.md` e os testes automatizados do HEAD atual.

## Estado atual

A v0.0.24 mantém o fluxo híbrido vigente e publica a extensão Chromium MV3 v0.2.2. O HEAD seguinte prepara a v0.2.3 com reconciliação de operação após cold start, start idempotente e limpeza de estado obsoleto. Bridge standalone e WebView2 continuam preservados até a validação física sem Bridge.

Authenticode e branch protection/required status checks são opcionais por decisão do projeto em 18/09/2026 e não representam backlog.

A validação física Windows/A1/SEFAZ/Portal permanece separada do CI e só é necessária quando se quiser declarar o comportamento físico do ambiente real validado. Nova release deve ser publicada somente quando explicitamente solicitada e após validação do commit que será distribuído.
