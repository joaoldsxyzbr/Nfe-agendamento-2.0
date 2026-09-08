# Fechamento — Instalador Windows v0.0.3

Data: 2026-09-08

## Motivo da release corretiva

A validação física inicial da `v0.0.2` revelou que o Bridge instalado não permanecia aberto. A investigação identificou dois problemas de distribuição:

1. Bridge e helper Portal eram publicados com `--self-contained false`, exigindo runtime .NET externo no PC;
2. o instalador não fornecia `Bridge:AllowedOrigins`, fazendo a integração com o site falhar em produção mesmo quando o processo iniciava.

A `v0.0.3` corrige exclusivamente esses dois pontos de distribuição/configuração, sem alterar a lógica fiscal.

## Implementado

- Bridge e helper Portal versionados em `0.0.3`;
- publish Windows x64 de ambos com `--self-contained true`;
- nenhuma instalação prévia do .NET 10 é necessária para iniciar os executáveis distribuídos;
- instalador Inno Setup continua por usuário e sem UAC/admin;
- instalação em `%LOCALAPPDATA%\NFe Agendamento Bridge`;
- Setup solicita uma origem HTTPS exata para o site;
- origem normalizada e rejeitada quando contém esquema não HTTPS, caminho, query, fragmento, userinfo, aspas, barra invertida ou espaços;
- `Bridge:AllowedOrigins:0` é aplicado ao primeiro start, atalho do Menu Iniciar e auto-start em `HKCU`;
- nenhum wildcard foi adicionado à allowlist;
- segurança de loopback/Host/CORS permanece fail-closed;
- ícone próprio azul-escuro/amarelo preservado;
- nenhum serviço, tarefa agendada, alteração de firewall ou updater automático;
- CI Windows publica Bridge/Portal self-contained e compila o `Setup.exe` real;
- artifacts separados para `NFeAgendamentoBridge-Setup-v0.0.3` e `NfeAgendamentoBridge-win-x64`;
- workflow `release-v0.0.3.yml` usa somente artifacts do mesmo CI verde;
- README, notas de release e checklist físico atualizados.

## Evidência TDD antes do marker final

A correção foi feita em ciclos RED/GREEN separados:

- contrato self-contained falhou na `v0.0.2` e passou após trocar os publishes para `--self-contained true`;
- contrato da origem HTTPS falhou antes da implementação e passou após o Setup aplicar `Bridge:AllowedOrigins:0` aos três caminhos de inicialização;
- o runner Windows compilou com sucesso o Inno Setup contendo self-contained + configuração de Origin antes da preparação da `v0.0.3`;
- contrato da `v0.0.3` falhou com cinco diferenças esperadas enquanto versionamento/workflow ainda estavam em `0.0.2`.

## Gate final

Este commit `release: v0.0.3` é o marcador canônico. Para considerar a parte automatizável concluída é obrigatório confirmar neste mesmo SHA:

- web verde;
- Bridge verde;
- windows-package verde;
- `NFeAgendamentoBridge-Setup-v0.0.3.exe` gerado;
- `NfeAgendamentoBridge-win-x64.zip` gerado para fallback técnico;
- workflow de release concluído com sucesso;
- tag/release `v0.0.3` apontando para este SHA.

## Pendência externa ao CI

Continua obrigatória a aceitação física descrita em `docs/testing/acceptance.md`: instalar a `v0.0.3` em Windows real, informar a origem HTTPS do site, confirmar inicialização/auto-start sem runtime .NET externo, A1 real, SEFAZ, DANFE/PDF e fallback Portal/hCaptcha.
