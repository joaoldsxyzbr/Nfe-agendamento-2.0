# Segurança do Bridge local

## Objetivo

O Bridge existe somente para operações que o navegador não consegue executar diretamente: acesso ao certificado A1/chave privada do Windows, transporte autenticado para a SEFAZ e abertura controlada do Portal Nacional da NF-e quando houver limite de consumo.

Ele **não é um servidor de rede** e não deve ser exposto na LAN ou na Internet.

## Fronteiras de confiança

```text
Site HTTPS oficial
https://nfeagendamento.joaolds.xyz.br
   │ JSON estrito
   ▼
127.0.0.1:17345 /api/v1
   │
   ├─ CurrentUser/My → certificado A1 + chave privada
   ├─ SEFAZ → NFeDistribuicaoDFe
   └─ helper WebView2 → Portal Nacional da NF-e

NfeAgendamento.App.exe
   │ Named Pipe CurrentUserOnly + lease
   ▼
NfeAgendamento.Bridge.exe --managed
```

O site recebe somente metadados do certificado, status fiscais e XML da NF-e. A chave privada nunca é serializada nem enviada ao site/cloud.

## Rede local

O host ASP.NET Core usa exclusivamente:

```text
http://127.0.0.1:17345
```

O middleware rejeita `Host` diferente de `127.0.0.1:17345`. Não existem `0.0.0.0`, bind LAN, mDNS, pareamento, líder/standby ou servidor central.

## Origin, CORS e headers do site

Todas as chamadas `/api/v1/*` feitas pelo navegador exigem `Origin` explicitamente permitido em `Bridge:AllowedOrigins`. Não existe wildcard.

A distribuição de produção inclui em `appsettings.json` exatamente:

```json
{
  "Bridge": {
    "AllowedOrigins": [
      "https://nfeagendamento.joaolds.xyz.br"
    ]
  }
}
```

O Setup **não solicita URL**, não grava argumentos `Bridge:AllowedOrigins` no atalho, no auto-start ou no primeiro start e não amplia a allowlist. A configuração de desenvolvimento permanece separada em `appsettings.Development.json`, restrita ao Vite local em `http://127.0.0.1:5173`.

A validação continua fail-closed: origem ausente, `http://nfeagendamento.joaolds.xyz.br`, qualquer host diferente ou qualquer valor não presente na allowlist recebe `403`.

O site publica `apps/web/public/_headers` com CSP restritiva. Em produção, `connect-src` permite somente o próprio site e `http://127.0.0.1:17345`; `object-src` e `frame-ancestors` são bloqueados, e também são enviados `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` restritiva e `X-Frame-Options: DENY`.

Não adicionar wildcard nem origem arbitrária para contornar problemas de implantação.

## Instância única, controle e ownership do Bridge

O executável real do Bridge continua adquirindo um mutex nomeado antes de subir o host. Isso impede duas cópias de criarem listeners concorrentes em `127.0.0.1:17345`.

Na instalação normal, o App inicia o Bridge com `--managed`. O modo gerenciado cria um canal de controle separado da API HTTP:

```text
Named Pipe: NfeAgendamento.Bridge.Control.v1
Proteção: PipeOptions.CurrentUserOnly
```

O protocolo é versionado e limitado a identificação, claim do lease, heartbeat e shutdown. A identidade retornada pelo Bridge inclui PID, versão, caminho do executável, `instanceId` e indicação de modo gerenciado.

Antes de assumir uma instância existente, o App exige:

- modo gerenciado válido;
- PID positivo;
- `instanceId` presente;
- versão exatamente igual à versão esperada do App;
- caminho normalizado exatamente correspondente ao `NfeAgendamento.Bridge.exe` instalado esperado.

Se a identidade não puder ser validada, o App falha fechado e não mata o processo.

### Lease e watchdog

Uma instância gerenciada aceita somente um controlador válido por vez.

Valores centralizados atuais:

- heartbeat do App: **2 s**;
- expiração do lease: **8 s**;
- prazo inicial para o Bridge receber um lease: **10 s**;
- verificação do watchdog: **500 ms**.

Se o App desaparecer sem executar shutdown, o lease expira e o próprio Bridge inicia encerramento gracioso. A execução standalone de desenvolvimento não depende desse lease.

### Adoção e reinício

Ao iniciar, o App tenta primeiro conectar ao control pipe e reivindicar uma instância gerenciada válida já existente. Só inicia uma nova cópia quando não existe uma instância controlável.

Se o Bridge controlado cair inesperadamente, o App aplica backoff de reinício:

```text
1 s → 2 s → 5 s
```

As falhas são limitadas por uma janela/circuit breaker de aproximadamente 30 s. Depois do limite, o tray passa a `Bridge indisponível` em vez de entrar em crash-loop infinito.

O texto do `NotifyIcon` acompanha o estado efetivo: ativo, reconectando ou indisponível.

### Sair

Ao escolher **Sair**:

1. o App interrompe seu monitoramento;
2. envia `Shutdown` pelo control pipe usando o lease válido;
3. aguarda encerramento gracioso;
4. se o processo não terminar, término forçado só pode atingir o PID previamente identificado e somente após validar novamente o caminho do executável esperado.

Não existe varredura seguida de `Kill` por nome de processo.

A proteção é aplicada ao executável real; hosts in-process dos testes continuam independentes.

## API local

A API é versionada em `/api/v1` e expõe somente:

- `GET /health`;
- `GET /certificates`;
- `POST /certificate/select`;
- `POST /nfe/lookup`;
- `POST /portal/start`;
- `GET /portal/status/{operationId}`;
- `POST /portal/cancel/{operationId}`.

Entradas são revalidadas no Bridge mesmo quando o site já validou a chave.

## Certificado A1

- origem: `StoreName.My` / `StoreLocation.CurrentUser`;
- exige chave privada, validade vigente e Client Authentication quando EKU estiver presente;
- apenas o thumbprint selecionado é persistido em `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json`;
- cada lookup trabalha com material de certificado independente e o descarta ao concluir;
- PFX, senha e chave privada não são gravados pelo Bridge.

## Consulta SEFAZ e timeouts

- uma consulta fiscal gera no máximo uma tentativa de transporte;
- `656`, HTTP `429`, timeout e falha ambígua **não** disparam retry automático;
- resposta/XML é limitada a 10 MiB;
- DTD é proibido e `XmlResolver` fica desabilitado;
- `docZip`/`infNFe` deve corresponder exatamente à chave pedida antes de o XML seguir para o site.

No cliente web, os timeouts são separados por classe de operação:

- `health`: 2 s;
- certificados/seleção local: 5 s;
- `nfe/lookup`: 50 s;
- start/status/cancel do Portal: 8 s por chamada.

Esses limites não criam retry fiscal automático.

## Portal/WebView2

O helper `NfeAgendamento.Portal.exe` é um processo Windows separado e acompanha o Bridge na distribuição.

Antes de declarar `webView2Available=true`, o Bridge executa o helper em modo headless `--probe-runtime`. O resultado positivo é cacheado. Se o helper não existir, o Runtime estiver ausente, o probe falhar ou exceder o timeout curto, o fallback é marcado como indisponível.

No fallback, o helper opera em modo servidor persistente com IPC local por Named Pipe e reaproveita processo/WebView2 entre consultas sequenciais. Uma operação por vez é aceita.

### Reconexão e cooldown

Uma falha fatal de sessão/protocolo invalida a sessão persistente atual antes de devolver erro. O cliente aplica cooldown curto de **2 s** antes de recriar conexão/helper, evitando restart-loop. Depois do cooldown, uma sessão saudável pode ser criada novamente.

O servidor do helper aceita nova sessão IPC enquanto o processo permanece saudável e seu owner ainda está vivo.

### Cancelamento end-to-end

O cancelamento percorre todo o caminho:

```text
pagehide/reload ou cancelamento web
        ↓
POST /api/v1/portal/cancel/{operationId}
        ↓
PortalFallbackService CancellationToken
        ↓
PersistentPortalClient
        ↓ cancel_operation
helper Portal / operação WebView2
```

O cancelamento disparado em `pagehide` usa um POST pequeno com `keepalive: true`, sem reutilizar um `AbortSignal` já cancelado.

Uma conclusão tardia não pode sobrescrever estado `cancelled`.

### Retenção terminal

Estados `completed`, `failed` e `cancelled` permanecem disponíveis por **2 minutos** para permitir o polling final do navegador. Depois disso, status, XML, CTS e recursos associados são removidos; nova consulta ao status retorna ausência da operação.

### Restrições do helper

- URL fixa em `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx`;
- navegação de topo restrita ao host oficial;
- novas janelas externas bloqueadas;
- seleção do certificado pelo thumbprint já escolhido no site;
- somente download HTTPS oficial `/portal/downloadNFe.aspx` é aceito;
- XML limitado a 10 MiB e validado contra a chave antes do handoff;
- hCaptcha é sempre resolvido manualmente pelo usuário;
- não existe `hcaptcha.execute`, `grecaptcha.execute` ou mecanismo equivalente de bypass.

O fluxo normal do site não anuncia o Portal. O fallback só é exibido quando a resposta SEFAZ é classificada como `consumption_limit`.

## Supply chain e gates de build

A árvore web é reprodutível por `package-lock.json` e o CI usa `npm ci`. O job web executa `npm audit --audit-level=high` antes de testes/build; o lockfile atual passa com zero vulnerabilidades `high`/`critical`.

O override `sharp: 0.35.4` corrige o advisory transitivo trazido pelo toolchain Cloudflare sem `npm audit fix --force`. Install scripts necessários de `esbuild`, `sharp` e `workerd` ficam explicitamente aprovados por versão.

Na suíte .NET, `xUnit1051` é promovido a erro para impedir que testes async ignorem o token de cancelamento do xUnit.

No Portal, `MSB3277` também é promovido a erro. Como o projeto é WinForms, a referência `Microsoft.Web.WebView2.Wpf` adicionada pelo pacote WebView2 é removida antes de `ResolveAssemblyReferences`; Core + WinForms permanecem publicados. Isso elimina o conflito `WindowsBase` sem suprimir o warning.

Builds/publishes desktop são validados em `windows-latest` antes de gerar o instalador.

## Atualizações e versionamento

O App oferece somente atualização **manual e confirmada**. Ele consulta a release estável mais recente do repositório oficial, seleciona o Setup esperado e valida tamanho e SHA-256 antes de permitir sua execução.

A versão canônica fica em `Directory.Build.props`. Bridge, App, Portal, CI, instalador e release derivam dessa fonte; o workflow `.github/workflows/release.yml` é genérico e publica somente artifacts de um CI verde do mesmo commit marcador `release: v<versão>`.

O workflow de release cria/valida a tag contra o SHA exato aprovado pelo `workflow_run`, evitando que avanço posterior da `main` altere o target da release.

## Dados persistentes

O projeto não mantém login, usuários, histórico fiscal, banco ou fila. Fora o thumbprint do certificado e os dados internos necessários ao perfil do WebView2, operações de consulta são efêmeras.

## Hardening externo ainda pendente

Dois controles não são implementáveis apenas pelo código atual:

- **Authenticode:** App, Bridge, Portal e Setup continuam sem assinatura de publisher até existir certificado de code signing e segredo seguro para o pipeline;
- **proteção da `main`:** branch protection/rulesets e required status checks dependem de permissão administrativa/configuração do GitHub.

Não tratar SHA de artifact, HTTPS do GitHub ou validação interna do updater como substitutos de Authenticode.

## Checklist de produção

Antes de uso real:

1. confirmar que o site é servido exatamente em `https://nfeagendamento.joaolds.xyz.br`;
2. confirmar que `/health` responde com esse `Origin` autorizado;
3. confirmar que Origin diferente, ausente ou em HTTP recebe `403`;
4. confirmar que o processo escuta apenas `127.0.0.1:17345`;
5. confirmar headers de produção/CSP;
6. confirmar instância única, claim do Bridge gerenciado, heartbeat e shutdown pelo tray;
7. provocar somente de forma controlada uma queda do Bridge e validar backoff/circuit breaker;
8. validar A1 real em `CurrentUser/My`;
9. validar que `webView2Available` reflete o Runtime;
10. validar helper WebView2/Portal oficial e cancelamento/reconexão;
11. executar `docs/testing/acceptance.md` e registrar os resultados;
12. não declarar publisher assinado nem proteção de branch enquanto os hardenings externos acima não forem configurados.
