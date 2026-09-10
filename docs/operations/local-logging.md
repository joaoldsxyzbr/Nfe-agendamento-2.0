# Logging local do Bridge

O Bridge mantém um log local estruturado para diagnóstico de falhas de execução, comunicação com a SEFAZ e lifecycle do processo.

## Localização

Arquivo ativo:

```text
%LOCALAPPDATA%\NfeAgendamentoBridge\logs\bridge.log
```

O formato é **JSON Lines**: cada linha é um objeto JSON independente com os campos:

- `timestampUtc` — instante UTC do evento;
- `level` — nível do log;
- `category` — categoria do componente;
- `eventId` — identificador estável do evento quando fornecido;
- `message` — mensagem diagnóstica controlada;
- `exceptionType` — tipo da exceção quando disponível, sem mensagem ou stack trace.

## Rotação e limite

- arquivo ativo limitado a aproximadamente **2 MiB**;
- até **4 arquivos históricos** (`bridge.1.log` a `bridge.4.log`);
- o histórico mais antigo é removido quando um novo giro é necessário;
- a gravação é best-effort: falha de disco/permissão no log nunca deve interromper o Bridge ou uma consulta.

O limite total esperado fica em torno de 10 MiB considerando o arquivo ativo e quatro históricos.

## Privacidade

O logging foi desenhado para diagnóstico sem transformar o log em armazenamento fiscal. Não registrar deliberadamente:

- chave de acesso da NF-e;
- XML da NF-e;
- PFX;
- senha de certificado;
- chave privada;
- mensagem ou stack trace de exceção.

Falhas fiscais usam mensagens genéricas e Event IDs estáveis. O log não altera respostas da API, retry, fluxo SEFAZ, fallback Portal ou tratamento do certificado A1.

## Eventos fiscais principais

| Event ID | Significado |
| ---: | --- |
| 1001 | falha ao validar identidade fiscal do certificado |
| 1002 | HTTP 429 / excesso de requisições |
| 1003 | falha de transporte com a SEFAZ |
| 1004 | timeout da comunicação com a SEFAZ |
| 1005 | resposta da SEFAZ rejeitada pela validação local |
| 1006 | falha técnica inesperada no lookup |
| 1007 | retorno SEFAZ `656` / limite de consumo |
| 2001 | Bridge iniciado |
| 2002 | Bridge encerrando |

Para suporte, copie somente os arquivos `bridge*.log` necessários ao período do problema e continue tratando-os como dados internos da empresa.
