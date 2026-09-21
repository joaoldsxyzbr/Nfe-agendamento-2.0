# Site-first + agente fiscal local mínimo — Design

**Status:** implementação incremental em andamento — Release A (`v0.0.18`) publicada; Release B (`v0.0.19`) implementada e em validação; aposentadoria do App ainda bloqueada pelo gate de estabilidade.  
**Baseline original:** `main` em 21/09/2026, release pública v0.0.17. Estado atual documentado no plano de implementação.  
**Objetivo:** fazer o NFe Agendamento ser percebido como um único produto web, mantendo no Windows somente as responsabilidades que exigem A1, confiança local ou integração controlada com o Portal Nacional.

## Decisão arquitetural

A arquitetura-alvo é:

```text
Usuário
  ↓
Site NFe Agendamento
  ├─ UI, lote, DANFE, XML/ZIP, mensagens, diagnóstico e atualização
  ↓
Bridge fiscal local — 127.0.0.1:17345
  ├─ certificado A1 em CurrentUser/My
  ├─ uso da chave privada
  ├─ NFeDistribuicaoDFe / SEFAZ
  ├─ FiscalUsageGuard
  ├─ coordenação fiscal multi-PC
  ├─ resolução local de fornecedor enquanto houver identificadores privados
  └─ orquestração do fallback
          ↓
      Portal helper WebView2
          └─ visível somente quando o usuário precisa interagir com o Portal/hCaptcha
```

O alvo **não** é “Bridge que apenas guarda o A1”. O Bridge permanece a fronteira fiscal local. O site não recebe PFX, senha ou chave privada.

## Motivos da decisão

1. O site já concentra interface, parsing XML, DANFE, lote e apresentação.
2. O Bridge já concentra A1, transporte SEFAZ e proteção fiscal.
3. O helper Portal usa WebView2 para capacidades que o navegador comum não oferece ao site de outra origem: seleção controlada de certificado cliente, observação da página oficial e interceptação do download do XML.
4. Transformar tudo em desktop aumentaria o custo de manutenção sem remover a complexidade fiscal.
5. Remover o helper e usar somente o navegador normal tornaria o fallback mais manual: o usuário teria de baixar e importar o XML.
6. O App de bandeja atual exerce funções reais de supervisão e atualização; portanto sua retirada precisa ser gradual e condicionada a substitutos comprovados.

## Princípios obrigatórios

- Preservar consulta direta SEFAZ como caminho padrão.
- Preservar uma única tentativa fiscal por operação, sem retry fiscal automático.
- Preservar `FiscalUsageGuard` local e coordenação multi-PC.
- Preservar `CurrentUser/My`; chave privada nunca sai do Windows.
- Preservar bind exclusivo em `127.0.0.1:17345`.
- Preservar validação estrita de `Host`, `Origin` e CORS sem wildcard.
- Preservar hCaptcha manual; não resolver ou contornar captcha.
- Preservar validação do XML: limite de 10 MiB, DTD proibido e chave consultada correspondente.
- Preservar regras de fornecedor locais enquanto os identificadores fiscais reais não puderem ir ao bundle público.
- Não mudar DANFE, parser fiscal ou transporte SEFAZ na mesma etapa em que o lifecycle Windows for alterado.
- Não remover contratos antigos na mesma release em que seu substituto estrear.
- Cada fase precisa possuir rollback simples antes da fase seguinte.

## Estado atual que deve continuar funcionando

Na v0.0.17:

- o App WinForms inicia no logon;
- o App inicia o Bridge com `--managed`;
- App e Bridge usam Named Pipe com lease/heartbeat;
- o App reinicia o Bridge com backoff/circuit breaker;
- o App oferece atualização manual;
- o Bridge standalone já possui mutex de instância única e, sem `--managed`, não expira por lease;
- o Portal helper é persistente depois do primeiro uso, porém seu processo/WebView2 ainda são criados sob demanda;
- o site possui diagnóstico do Bridge e link do Setup;
- o site usa `POST /nfe/lookup` e `POST /portal/start` + polling de status.

Nenhuma dessas garantias deve ser removida antes de haver substituto equivalente.

## Responsabilidades finais

### Site

Responsável por toda experiência percebida:

- consulta unitária e lote;
- estados de carregamento, erros e progresso;
- seleção visual do A1;
- diagnóstico do componente local;
- diferenciação entre Bridge ausente, versão incompatível e bloqueio de acesso local pelo navegador;
- DANFE, impressão/PDF, XML e ZIP;
- status do fallback Portal;
- aviso de versão nova do componente Windows;
- download do Setup oficial;
- instruções de recuperação;
- fallback manual por importação de XML apenas como contingência, nunca como caminho padrão.

### Bridge fiscal

Responsável apenas por domínio local/fiscal:

- `GET /health` e capabilities;
- listar/selecionar A1;
- acesso à chave privada;
- transporte SEFAZ;
- proteção local de consumo;
- coordenação compartilhada entre PCs;
- deduplicação/idempotência local de operações fiscais;
- resolução local de fornecedor, se necessária para manter identificadores privados;
- orquestração do Portal helper;
- logs técnicos locais sem chave/XML/segredos.

### Portal helper

Responsável somente por:

- inicializar WebView2;
- navegar apenas no Portal oficial permitido;
- selecionar apenas o A1 escolhido;
- preencher a chave;
- aguardar hCaptcha humano;
- continuar o fluxo oficial;
- aceitar apenas o download XML esperado;
- validar e devolver XML ao Bridge;
- ocultar-se novamente.

O helper não vira segunda interface do produto.

### App de bandeja

Componente de transição.

Ele só pode ser retirado depois que existirem e estiverem validados:

- startup por usuário sem App;
- instância única do Bridge;
- diagnóstico pelo site;
- caminho de atualização pelo site/Setup;
- comportamento aceitável após crash;
- upgrade de instalação antiga;
- rollback para a arquitetura anterior.

Se esses critérios não forem atingidos, o App deve permanecer como supervisor **headless**, sem ser apresentado como produto.

## Contrato de health e capabilities

Evoluir de forma aditiva:

```json
{
  "status": "ok",
  "version": "0.0.18",
  "webView2Available": true,
  "certificateSelected": true,
  "capabilities": {
    "directLookup": true,
    "portalFallback": true,
    "portalPrewarm": true,
    "manualXmlImport": true
  }
}
```

Clientes antigos continuam válidos porque os campos atuais não mudam.

O site não deve inferir feature apenas pela versão; deve preferir `capabilities`.

## Diagnóstico de acesso local

O frontend deve distinguir:

```text
bridge_ok
bridge_not_running
bridge_version_incompatible
local_network_permission_denied
portal_runtime_unavailable
unknown_transport_error
```

O acesso `site HTTPS → 127.0.0.1` deve continuar tratado como integração local sujeita às políticas atuais do navegador. O usuário não deve receber apenas “Bridge indisponível” quando a causa puder ser classificada.

## Prewarm do Portal

A otimização deve ocorrer **quando o site for usado**, não no boot do Windows.

Fluxo:

1. site carrega;
2. `GET /health` confirma Bridge compatível;
3. se `capabilities.portalPrewarm === true`, o site chama `POST /portal/prewarm`;
4. Bridge cria/reutiliza a sessão persistente;
5. o processo Portal executa `PrepareAsync()` antes de anunciar readiness;
6. a janela continua oculta;
7. fallback real reutiliza a sessão já aquecida;
8. falha de prewarm nunca bloqueia consulta direta nem impede fallback cold-start.

Contrato:

```http
POST /api/v1/portal/prewarm
X-Nfe-Bridge: 1
```

Resposta:

```json
{ "state": "ready" }
```

O prewarm não pode:

- abrir janela;
- alterar certificado;
- iniciar consulta Portal;
- tocar na SEFAZ;
- criar nova operação fiscal.

## Idempotência e concorrência

Adicionar proteção explícita no Bridge sem substituir o `FiscalUsageGuard`.

### Request ID

O cliente novo envia:

```json
{
  "requestId": "UUID",
  "accessKey": "44 caracteres"
}
```

Compatibilidade: `requestId` é opcional durante a migração.

Regras:

- mesmo `requestId` + mesma chave reutiliza o resultado/operação existente dentro do TTL;
- mesmo `requestId` + chave diferente retorna conflito;
- mesma chave já em voo é coalescida para uma única execução fiscal;
- nenhuma política de idempotência autoriza retry da SEFAZ;
- após o TTL, uma nova ação explícita do usuário pode criar nova operação.

TTL alvo para resultado terminal: 2 minutos.  
Limite alvo do registry: 256 entradas, remoção de expiradas antes de rejeitar novas.

## Portal: máquina de estados

Formalizar no contrato interno:

```text
unavailable
cold
starting
ready
busy_waiting_user
busy_downloading
completed
cancelled
failed
recovering
```

Apenas `busy_waiting_user` exige janela visível.

O contrato público atual `waiting_for_user | completed | failed | cancelled` permanece até existir motivo real para uma mudança incompatível.

## Atualização Windows

A atualização passa a ser percebida no site.

Fluxo-alvo:

1. site lê `health.version`;
2. site consulta metadata oficial já exposta em `/api/update/latest`;
3. se houver versão compatível mais nova, mostra “Atualizar componente Windows”;
4. botão aponta para o Setup oficial no domínio do NFe Agendamento;
5. usuário executa o instalador;
6. Setup preserva `%LOCALAPPDATA%\NfeAgendamentoBridge`;
7. depois da instalação, o site detecta a nova versão via health.

Não criar auto-update silencioso no Bridge nesta migração.

Durante a transição, o updater do App continua funcionando. Ele só é removido quando o fluxo do site estiver validado.

## Lifecycle Windows

Não transformar o Bridge em Windows Service.

Motivos:

- o A1 está em `CurrentUser/My`;
- a instalação é por usuário, sem administrador;
- o Portal precisa de interação na sessão do usuário.

Estado final preferido:

```text
HKCU Run
  → NfeAgendamento.Bridge.exe
      → API loopback
      → Portal helper sob demanda/prewarm
```

O Bridge standalone atual já não depende de lease para continuar vivo. A migração deve aproveitar esse comportamento, não criar um segundo runtime.

### Crash recovery

Antes de retirar o supervisor, medir falhas reais.

Critério de segurança:

- se o Bridge não apresentar estabilidade suficiente sem supervisor, manter um supervisor headless temporariamente;
- não adicionar Scheduled Task, serviço privilegiado ou protocolo customizado apenas para atingir a meta estética de “um executável”.

Robustez vale mais que remover um processo.

## Segurança

Manter:

- loopback;
- Host/Origin exatos;
- CORS restrito;
- `X-Nfe-Bridge` permitido e exigido nas mutações novas;
- schemas JSON fechados;
- Named Pipe `CurrentUserOnly`;
- helper com pipe aleatório;
- allowlist de host/path no Portal;
- limite e validação de XML;
- proteção de update por origem, nome, tamanho e SHA-256;
- logs sem chave NF-e completa, XML, senha, PFX ou chave privada.

Authenticode deve ser adotado como reforço quando a infraestrutura de assinatura estiver disponível, mas sua ausência não deve bloquear esta migração.

## Métricas locais

Registrar apenas duração/estado técnico:

- `bridge_start_to_healthy_ms`;
- `portal_process_start_ms`;
- `webview_ready_ms`;
- `portal_start_to_visible_ms`;
- `portal_download_to_bridge_ms`;
- `bridge_to_site_completed_ms`;
- cold vs warm;
- falhas de helper;
- falhas de Bridge;
- sucesso de atualização;
- bloqueios de acesso local classificados.

Nenhuma métrica contém chave NF-e, XML ou dados do A1.

## Estratégia de migração

### Fase 0 — baseline

Sem alteração funcional. Fixar contratos/testes e registrar tempos atuais.

### Fase 1 — site como única UX

Capabilities, diagnóstico melhor, atualização apresentada no site e mensagens de Portal centralizadas no site.

### Fase 2 — prewarm

Aquecer helper/WebView2 após health saudável. Cold-start continua como fallback.

### Fase 3 — hardening fiscal

Idempotência por `requestId`, coalescência de mesma chave em voo e limites locais defensivos.

### Fase 4 — Bridge autônomo em piloto

Instalador pode iniciar Bridge standalone por usuário em modo de transição. App continua empacotado para rollback.

### Fase 5 — retirada visual do App

Sem tray/UX paralela. Site cobre diagnóstico e update.

### Fase 6 — aposentadoria do App

Somente depois de equivalência comprovada. Remover autostart do App, depois código/pacote numa release posterior.

### Fase 7 — limpeza

Remover contratos e arquivos obsoletos apenas quando já não houver instalação suportada dependendo deles.

## Rollback

Toda mudança precisa ser reversível:

- prewarm falhou → usar helper sob demanda;
- site novo + Bridge antigo → usar somente capabilities existentes;
- Bridge autônomo falhou → reinstalador/versão de transição restaura autostart do App;
- Portal helper falhou → manter opção de importação manual de XML como contingência;
- update do site falhou → link direto do Setup oficial continua disponível.

Não combinar numa única release:

- retirada do App;
- mudança de persistência fiscal;
- mudança de transporte SEFAZ;
- mudança estrutural do DANFE;
- remoção dos endpoints Portal existentes.

## Gates de validação

Antes de avançar:

1. testes web/bridge existentes verdes;
2. CI completo verde;
3. contratos antigos preservados;
4. nenhuma nova chamada SEFAZ automática;
5. nenhuma exposição adicional do A1;
6. upgrade preserva arquivos locais;
7. rollback documentado e testável;
8. documentação da arquitetura atualizada.

## Fora do escopo

- reescrever frontend;
- transformar o produto em desktop completo;
- enviar A1/PFX ao cloud;
- resolver captcha automaticamente;
- remover Durable Object/coordenação fiscal;
- substituir WebView2 por extensão de navegador;
- Windows Service;
- auto-update silencioso;
- mudanças no DANFE sem requisito separado.

## Critério de conclusão

A migração está concluída quando:

- o usuário trabalha exclusivamente pelo site;
- Bridge é infraestrutura local invisível;
- Portal só aparece quando interação humana for necessária;
- atualização e diagnóstico são conduzidos pelo site;
- A1/chave privada continuam locais;
- proteção fiscal continua equivalente ou mais forte;
- App de bandeja deixa de ser necessário **ou**, se a evidência mostrar que sua supervisão ainda é necessária, permanece apenas headless sem criar segunda UX.
