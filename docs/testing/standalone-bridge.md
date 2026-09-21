# Bridge standalone — lifecycle final

## Objetivo

Validar o lifecycle de `NfeAgendamento.Bridge.exe` iniciado diretamente pelo usuário/Windows. Desde a v0.0.20 este é o modo oficial; `NfeAgendamento.App.exe`, `--managed` e o protocolo de lease foram removidos.

## Contrato do instalador

- auto-start HKCU aponta diretamente para `NfeAgendamento.Bridge.exe`;
- start pós-instalação aponta para `NfeAgendamento.Bridge.exe`;
- não é passado `--managed`;
- o Bridge usa `OutputType=WinExe` para não deixar console visível;
- não é criado serviço, Scheduled Task ou requisito de administrador;
- `%LOCALAPPDATA%\NfeAgendamentoBridge` é preservado em upgrades.

## Gates automatizados

A suíte .NET comprova:

- ausência do diretório/projeto `NfeAgendamento.App`;
- ausência do protocolo de controle/lease legado;
- mutex de instância única preservado;
- instalador final apontando somente para o Bridge;
- CI publicando somente Bridge + Portal;
- release validando o pacote sem exigir App.

## Checklist físico

1. instalar o Setup oficial;
2. confirmar que o Bridge inicia no logon sem janela de console;
3. confirmar `GET /api/v1/health` pelo site oficial;
4. fazer logout/login e repetir o health;
5. reiniciar o Windows e repetir o health;
6. tentar iniciar uma segunda cópia e confirmar que o mutex impede listener concorrente;
7. validar seleção/persistência do certificado já configurado;
8. validar abertura do helper Portal e retorno ao site;
9. instalar uma atualização por Setup e confirmar preservação de `%LOCALAPPDATA%\NfeAgendamentoBridge`;
10. encerrar manualmente o Bridge e confirmar que o site diagnostica a indisponibilidade sem inventar uma causa;
11. iniciar novamente o Bridge e confirmar recuperação;
12. confirmar que `NfeAgendamento.App.exe` não existe no diretório instalado.

## Observação

Esses testes físicos continuam fora do CI. A v0.0.20 pode ser tecnicamente publicada com CI/CodeQL verdes sem que se declare o ambiente real fisicamente validado.
