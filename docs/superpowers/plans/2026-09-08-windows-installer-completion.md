# Fechamento — Instalador Windows v0.0.2

Data: 2026-09-08

## Implementado

- versão `0.0.2` no Bridge e helper Portal;
- ícone próprio azul-escuro/amarelo no Bridge;
- instalador Inno Setup por usuário;
- `PrivilegesRequired=lowest`, sem UAC/admin;
- instalação em `%LOCALAPPDATA%\NFe Agendamento Bridge`;
- atalho no Menu Iniciar;
- auto-start em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`;
- desinstalação remove auto-start e arquivos do aplicativo, preservando a configuração local do certificado;
- nenhum serviço, tarefa agendada, alteração de firewall ou updater automático;
- CI Windows compila o `Setup.exe` real e valida sua existência;
- artifacts separados para Setup e pacote técnico;
- workflow `v0.0.2` usa somente artifacts do mesmo CI verde;
- notas de release e checklist físico atualizados.

## Evidência automatizada antes do marker final

O CI confirmou build real do Inno Setup e gerou:

- `NFeAgendamentoBridge-Setup-v0.0.2`;
- `NfeAgendamentoBridge-win-x64`.

O gate final é repetir web + Bridge + Windows package no commit `release: v0.0.2` e confirmar a publicação dos dois assets da release.

## Pendência externa ao CI

Permanece obrigatória a aceitação física descrita em `docs/testing/acceptance.md`: instalação/desinstalação em Windows real, auto-start após novo login, A1 real, SEFAZ real, DANFE/PDF e fallback Portal/hCaptcha.
