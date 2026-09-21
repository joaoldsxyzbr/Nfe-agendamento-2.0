# Piloto do Bridge standalone

## Objetivo

Validar o ciclo de vida do `NfeAgendamento.Bridge.exe` iniciado diretamente por usuário antes de qualquer retirada definitiva do `NfeAgendamento.App.exe`.

A Release B é de transição: o App continua no pacote para rollback. O modo padrão do instalador também continua sendo `BridgeAutostartMode=app`.

## Como o piloto é produzido

O script `apps/bridge/installer/NfeAgendamentoBridge.iss` aceita:

```text
BridgeAutostartMode=app
BridgeAutostartMode=standalone
```

Sem define explícito, o valor é `app`.

No modo `standalone`:

- o auto-start HKCU aponta para `NfeAgendamento.Bridge.exe`;
- o start pós-instalação aponta para `NfeAgendamento.Bridge.exe`;
- não é passado `--managed`;
- `NfeAgendamento.App.exe` continua empacotado para rollback;
- não é criado serviço, Scheduled Task ou requisito de administrador.

## Gates automatizados

A suíte .NET deve comprovar:

- default do instalador continua `app`;
- o modo `standalone` seleciona `NfeAgendamento.Bridge.exe`;
- Registry e Run usam exatamente um executável selecionado pelo define;
- nenhum argumento `--managed` é incluído no instalador standalone;
- o Bridge mantém mutex de instância única;
- o servidor de controle/lease só é registrado quando o processo foi iniciado com `--managed`;
- CI continua publicando App, Bridge e Portal no pacote da transição.

## Checklist físico do piloto

Executar somente em uma instalação de teste da Release B:

1. instalar o Setup compilado em modo standalone;
2. confirmar que o Bridge inicia no logon do usuário;
3. confirmar `GET /api/v1/health` pelo site oficial;
4. fazer logout/login e repetir o health;
5. reiniciar o Windows e repetir o health;
6. tentar iniciar uma segunda cópia e confirmar que o mutex impede listener concorrente;
7. validar seleção/persistência do certificado já configurado;
8. validar abertura do helper Portal e retorno ao site;
9. instalar uma atualização por Setup e confirmar preservação de `%LOCALAPPDATA%\\NfeAgendamentoBridge`;
10. encerrar manualmente o Bridge e confirmar que o site diagnostica a indisponibilidade sem inventar uma causa;
11. executar o App empacotado como rollback e confirmar o fluxo gerenciado previsto para a release de transição.

## Critério para a Task 8

Este piloto não autoriza remover o App. A aposentadoria só pode avançar depois de uma release de transição estável e de evidência de que startup, instância única, persistência, Portal, atualização e comportamento após encerramento atendem ao gate documentado no plano site-first.
