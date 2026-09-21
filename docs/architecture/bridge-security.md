# Segurança do Bridge local

## Objetivo

O Bridge existe somente para operações que o navegador não consegue executar diretamente: acesso ao certificado A1/chave privada do Windows, transporte autenticado para a SEFAZ e abertura controlada do Portal Nacional da NF-e quando o fluxo direto precisar de fallback (`consumption_limit` ou `cStat 217`).

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

## Instância única e lifecycle standalone do Bridge

O executável real do Bridge adquire um mutex nomeado antes de subir o host. Isso impede duas cópias de criarem listeners concorrentes em `127.0.0.1:17345`.

A partir da v0.0.20, o Bridge é o único executável de lifecycle do componente Windows:

- o Setup registra `NfeAgendamento.Bridge.exe` diretamente no auto-start HKCU;
- o start pós-instalação inicia o mesmo executável;
- não existe `--managed`, App supervisor, lease, heartbeat ou canal de controle dedicado;
- o projeto do Bridge usa `OutputType=WinExe`, portanto o início no logon não deixa janela de console;
- o helper Portal continua sendo criado/reutilizado pelo Bridge somente quando necessário;
- encerramento manual ou crash deixa o site diagnosticar o componente como indisponível; não existe reinício silencioso por um segundo supervisor.

A retirada do App ocorreu somente depois da release de transição v0.0.19. A validação física continua separada e não é apresentada como evidência do CI.

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

### Descoberta aditiva de capabilities

`GET /health` preserva os campos existentes e pode incluir `capabilities`. O campo é aditivo para manter compatibilidade com Bridges anteriores à migração site-first.

Na primeira etapa da migração:

```json
{
  "directLookup": true,
  "portalFallback": true,
  "portalPrewarm": false,
  "manualXmlImport": false
}
```

O site novo aceita um Bridge legado sem `capabilities`. Quando o campo existir, todos os valores precisam ser booleanos e o cliente não deve inferir uma funcionalidade como disponível antes de ela ser efetivamente entregue. `portalPrewarm` e `manualXmlImport` só passam a `true` nas etapas que implementarem e testarem essas funções.

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

O fluxo normal do site não anuncia o Portal. O fallback é exibido somente quando a resposta SEFAZ é `consumption_limit` ou quando chega como `fiscal_status` com `cStat 217`; outros estados fiscais continuam sem abrir o Portal.

## Supply chain e gates de build

A árvore web é reprodutível por `package-lock.json` e o CI usa `npm ci`. O job web executa `npm audit --audit-level=high` antes de testes/build; o lockfile atual passa com zero vulnerabilidades `high`/`critical`.

O override `sharp: 0.35.4` corrige o advisory transitivo trazido pelo toolchain Cloudflare sem `npm audit fix --force`. Install scripts necessários de `esbuild`, `sharp` e `workerd` ficam explicitamente aprovados por versão.

Na suíte .NET, `xUnit1051` é promovido a erro para impedir que testes async ignorem o token de cancelamento do xUnit.

No Portal, `MSB3277` também é promovido a erro. Como o projeto é WinForms, a referência `Microsoft.Web.WebView2.Wpf` adicionada pelo pacote WebView2 é removida antes de `ResolveAssemblyReferences`; Core + WinForms permanecem publicados. Isso elimina o conflito `WindowsBase` sem suprimir o warning.

Builds/publishes desktop são validados em `windows-latest` antes de gerar o instalador.

## Atualizações e versionamento

A atualização normal é apresentada pelo **site**. Desde a v0.0.16, os clientes usam o domínio oficial em vez de acessar diretamente a API/download do GitHub:

```text
GET https://nfeagendamento.joaolds.xyz.br/api/update/latest
GET https://nfeagendamento.joaolds.xyz.br/downloads/windows/vX.Y.Z/NFeAgendamentoBridge-Setup-vX.Y.Z.exe
```

O Worker consulta a release estável oficial server-side, exige tag semver, asset no estado `uploaded`, nome exato do Setup, tamanho positivo, digest SHA-256 válido e URL original exatamente pertencente ao repositório esperado. A resposta de metadata substitui a URL do GitHub pela rota versionada do domínio oficial.

A rota de download aceita somente `vX.Y.Z` e `NFeAgendamentoBridge-Setup-vX.Y.Z.exe` com a mesma versão. Ela constrói internamente a URL fixa do repositório e faz streaming do conteúdo; não existe parâmetro de host/URL arbitrário nem proxy genérico.

O updater legado do App foi removido na v0.0.20. O site valida a metadata estrita recebida do Worker e oferece somente a rota versionada do domínio oficial. Falha upstream é tratada como indisponibilidade da fonte sem transformar o Bridge saudável em erro.

A versão canônica fica em `Directory.Build.props`. Bridge, Portal, CI, instalador e release derivam dessa fonte; o workflow `.github/workflows/release.yml` é genérico e publica somente artifacts de um CI verde do mesmo commit marcador `release: v<versão>`.

O workflow de release cria/valida a tag contra o SHA exato aprovado pelo `workflow_run`, evitando que avanço posterior da `main` altere o target da release.

Limitação de migração: a v0.0.15 já publicada não pode ter seu updater embutido alterado retroativamente. Se o acesso direto ao GitHub falhar nessa versão, a migração inicial para v0.0.16 deve ser feita pelo botão de download do site; depois disso o updater usa o domínio oficial.

## Dados persistentes

O projeto não mantém login, usuários, histórico fiscal, banco ou fila. Fora o thumbprint do certificado e os dados internos necessários ao perfil do WebView2, operações de consulta são efêmeras.

## Controles opcionais

Authenticode e branch protection/rulesets não são requisitos deste projeto.

- **Authenticode:** o pipeline conserva suporte opcional à assinatura quando existir certificado/secrets. Sem eles, os artefatos podem ser publicados sem assinatura. O updater continua exigindo origem esperada, tamanho e SHA-256.
- **proteção da `main`:** não existe ruleset ativo e isso não é considerado pendência. CI e CodeQL continuam fornecendo verificação automatizada em pushes para a `main`.

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
12. se Authenticode for configurado futuramente, confirmar a assinatura dos artefatos; esse controle continua opcional.
