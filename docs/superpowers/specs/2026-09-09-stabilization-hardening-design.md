# Estabilização e hardening — NFe Agendamento 2.0

Data: 2026-09-09
Status: design aprovado em conversa, aguardando revisão formal da spec antes da implementação

## 1. Objetivo

Encerrar a rodada de estabilização do NFe Agendamento 2.0 com foco em robustez, segurança, reprodutibilidade e prevenção de regressões, sem adicionar funcionalidades de produto novas.

A meta não é apenas deixar o CI verde. A meta é reduzir a superfície de falhas que hoje reaparecem em revisões sucessivas, convertendo os problemas descobertos em contratos automatizados que impeçam sua reintrodução.

## 2. Escopo

Esta rodada cobre:

1. lifecycle e ownership do `NfeAgendamento.App.exe` + `NfeAgendamento.Bridge.exe`;
2. controle local e shutdown seguro do Bridge;
3. recuperação controlada do Bridge após falha;
4. lifecycle e reconexão do helper `NfeAgendamento.Portal.exe`;
5. cancelamento e expiração de operações Portal;
6. política de dependências web e vulnerabilidades;
7. eliminação de warnings relevantes de build, incluindo o conflito `WindowsBase`;
8. CI determinístico e com gates de segurança;
9. release estritamente vinculada ao SHA validado pelo CI;
10. documentação alinhada ao comportamento real;
11. ampliação da suíte de testes de regressão.

## 3. Fora de escopo

Não fazem parte desta rodada:

- novas funcionalidades de consulta;
- consulta em lote;
- login, banco ou histórico fiscal;
- arquitetura central/LAN;
- atualização silenciosa;
- automação de captcha;
- retry fiscal automático;
- redesign visual do site/DANFE;
- Authenticode sem certificado externo disponível.

A arquitetura funcional continua sendo:

```text
Site HTTPS oficial
        │
        ▼
Bridge local 127.0.0.1:17345
        │
        ├── Certificado A1 / Windows
        ├── SEFAZ
        └── Portal helper / WebView2 (somente fallback)
```

## 4. Princípios de projeto

### 4.1 Fail closed

Quando identidade, estado ou ownership de um componente não puder ser confirmado, a operação deve falhar de forma segura. Não serão usados atalhos como matar processos por nome ou aceitar origem arbitrária.

### 4.2 Um dono claro por responsabilidade

- App: coordena lifecycle do Bridge e UX de bandeja/atualização.
- Bridge: executa operações locais privilegiadas e expõe API HTTP loopback.
- Portal helper: executa somente o fluxo WebView2 isolado.
- Site: interface, parsing/apresentação e DANFE.

### 4.3 Recuperação limitada

Falhas transitórias podem ser recuperadas automaticamente, mas sempre com backoff, limite de tentativas e circuit breaker. Nenhum componente deve entrar em restart-loop infinito.

### 4.4 Estado efêmero

XML e estado de operações Portal não devem permanecer em memória além do necessário para handoff ao site.

### 4.5 Evidência antes de conclusão

Toda correção desta rodada deve ter teste de regressão e a rodada só termina após CI final completo, build Windows e documentação coerente.

## 5. App + Bridge: controle e ownership

### 5.1 Canal de controle

O Bridge ganhará um canal de controle por Named Pipe separado da API HTTP pública ao navegador.

Requisitos:

- `PipeOptions.CurrentUserOnly`;
- nome estável e específico do produto, separado do pipe do Portal;
- protocolo versionado;
- mensagens limitadas e tipadas;
- nenhuma exposição na LAN;
- nenhuma dependência de HTTP para shutdown/ownership.

Comandos mínimos:

- `Hello` / identificação;
- `ClaimLease`;
- `Heartbeat`;
- `Shutdown`.

Resposta de identificação deve conter, no mínimo:

- PID real do Bridge;
- versão do executável;
- caminho normalizado do executável;
- identificador único da instância;
- modo de execução (`managed` ou desenvolvimento/standalone).

### 5.2 Bridge gerenciado

Quando iniciado pelo App instalado, o Bridge será iniciado em modo gerenciado.

Nesse modo:

1. o App conecta ao control pipe;
2. valida PID, versão e caminho do executável;
3. reivindica um lease de controle;
4. envia heartbeats periódicos;
5. ao sair normalmente, envia `Shutdown` e aguarda término gracioso.

O Bridge não depende apenas do PID do processo pai para decidir lifecycle.

### 5.3 Lease

O lease existe para evitar Bridge órfão quando o App morre de forma abrupta.

Regras:

- somente uma sessão controladora ativa por instância gerenciada;
- heartbeat em intervalo curto e previsível;
- expiração do lease após múltiplos heartbeats ausentes, não após uma única perda;
- após expiração, o Bridge inicia shutdown gracioso;
- o lease não interfere em execução de desenvolvimento explicitamente standalone.

Valores exatos de intervalo e timeout serão centralizados como constantes/configuração interna e cobertos por testes. O design não depende de um número mágico espalhado pelo código.

### 5.4 Adoção de Bridge existente

Se o App iniciar e encontrar o mutex do Bridge já existente:

1. conecta ao control pipe;
2. valida a identidade da instância;
3. se for uma instância gerenciada válida sem controlador ativo, reivindica o lease;
4. se já houver outro controlador legítimo, o segundo App encerra sem interferir;
5. se a identidade não puder ser validada, o App não mata o processo.

Isso substitui qualquer lógica baseada em `GetProcessesByName()`.

### 5.5 Shutdown

Ao escolher **Sair**:

1. parar novas ações do tray;
2. enviar `Shutdown` pelo control pipe;
3. aguardar janela curta de encerramento gracioso;
4. se necessário, usar fallback de término forçado somente no PID previamente identificado pelo próprio Bridge e somente após validar que o caminho do executável corresponde ao Bridge instalado esperado;
5. nunca enumerar e matar processos arbitrários pelo nome.

### 5.6 Monitoramento e recuperação

O estado do tray deve refletir health real da instância, não apenas existência de mutex.

Quando o Bridge gerenciado cair inesperadamente:

- tentar reinício com backoff progressivo;
- exemplo de sequência aceitável: 1 s, 2 s, 5 s;
- limitar tentativas em uma janela de tempo;
- após exceder o limite, abrir circuit breaker e mostrar `Bridge indisponível`;
- novo ciclo automático só após período de recuperação ou ação explícita do usuário/novo start do App.

O objetivo é recuperar falha transitória sem esconder crash-loop persistente.

## 6. Portal persistente e IPC

### 6.1 Invariantes

Continuam obrigatórios:

- Portal apenas após `consumption_limit/656`;
- sem retry fiscal automático;
- hCaptcha sempre manual;
- URL/host oficial fixo;
- uma operação Portal por vez;
- XML limitado e validado contra a chave;
- `NamedPipe` restrito ao usuário atual.

### 6.2 Servidor persistente reconectável

O helper Portal deve manter o processo servidor enquanto saudável e aceitar nova sessão IPC após disconnect inesperado, em vez de necessariamente encerrar o processo após a primeira conexão perdida.

O loop externo do servidor será responsável por:

1. criar/aceitar conexão;
2. executar uma sessão;
3. limpar recursos daquela sessão;
4. aceitar nova conexão se o Bridge pai/owner continuar vivo;
5. encerrar quando watchdog/lifetime determinar término.

Nunca haverá duas operações WebView2 concorrentes.

### 6.3 Falha de IPC e cooldown

No cliente persistente do Bridge:

- erro fatal de protocolo, pipe ou helper invalida a sessão atual;
- a sessão deve ser descartada antes de retornar erro;
- nova criação de helper/sessão respeita cooldown curto após falha fatal;
- chamadas dentro do cooldown falham rapidamente com mensagem previsível;
- cooldown evita restart-loop em caso de helper quebrado;
- sucesso posterior limpa o estado de falha/cooldown.

O cooldown deve ser testável por abstração de relógio/tempo ou outra técnica determinística; testes não devem depender de esperas longas reais.

### 6.4 Cancelamento end-to-end

O cancelamento já existente será completado até o helper:

```text
pagehide/reload ou cancelamento web
        ↓
POST /api/v1/portal/cancel/{operationId}
        ↓
PortalFallbackService CancellationToken
        ↓
PersistentPortalClient
        ↓
helper Portal / operação WebView2
```

Uma conclusão tardia nunca deve sobrescrever um estado `cancelled`.

### 6.5 Retenção terminal

Estados `completed`, `failed` e `cancelled` continuam com retenção curta para permitir polling final do navegador.

Após expiração:

- remover status;
- remover XML;
- remover CTS e quaisquer recursos associados;
- consultas posteriores ao status retornam `404`.

## 7. Dependências web e supply chain

### 7.1 Reprodutibilidade

- `package-lock.json` permanece obrigatório;
- CI usa `npm ci`;
- nenhuma geração automática de lockfile no CI principal;
- mudanças de dependência devem atualizar manifest + lockfile no mesmo commit.

### 7.2 Vulnerabilidades

O CI terá gate explícito para vulnerabilidades `high` e `critical`.

Processo de atualização:

1. identificar advisories concretos;
2. separar runtime de tooling/dev-only;
3. atualizar para a menor versão segura compatível quando possível;
4. major upgrade é permitido quando necessário para remover vulnerabilidade relevante;
5. adaptar código/configuração/testes;
6. não usar `npm audit fix --force` sem revisão;
7. não suprimir advisory real apenas para manter CI verde.

Critério de aceite desta rodada: zero vulnerabilidades `high`/`critical` reportadas pela política adotada no CI.

### 7.3 Install scripts

Scripts necessários de pacotes como bundler/runtime devem ser tratados de forma explícita e auditável. Não será usado `--ignore-scripts` global se isso quebrar o funcionamento esperado de ferramentas como esbuild/workerd.

## 8. .NET, NuGet e warnings

### 8.1 Conflito WindowsBase/WebView2

O warning `MSB3277` entre versões de `WindowsBase` deve ser eliminado pela configuração correta de target/framework/referências/pacote WebView2.

Não é aceitável nesta rodada simplesmente suprimir o warning.

A correção deve preservar:

- build do helper Portal;
- execução WinForms/WebView2;
- publish self-contained win-x64;
- probe headless do runtime;
- seleção de certificado e captura do download oficial.

### 8.2 Warnings tratáveis

Warnings que representem problema de produto, compatibilidade ou teste devem ser eliminados ou promovidos a erro de CI quando a promoção não gerar ruído conhecido.

Warnings puramente de analisador em teste podem ser corrigidos de forma cirúrgica, como uso correto de `TestContext.Current.CancellationToken`, sem alterar comportamento de produção.

## 9. CI

O CI continuará dividido em web, Bridge e pacote Windows.

### 9.1 Web

Deve executar:

1. setup Node suportado;
2. `npm ci`;
3. gate de vulnerabilidade;
4. testes;
5. type-check/build;
6. Wrangler dry-run;
7. validação dos headers/CSP.

### 9.2 Bridge

Deve executar:

1. bootstrap/contratos estáticos necessários;
2. restore determinístico;
3. testes .NET;
4. build Bridge;
5. build Portal;
6. build App;
7. ausência de warnings definidos como bloqueantes.

### 9.3 Windows package

Deve:

1. resolver versão exclusivamente da fonte canônica;
2. publicar Bridge/Portal/App;
3. gerar Setup Inno;
4. validar presença dos executáveis esperados;
5. publicar artifacts nomeados com a versão canônica.

## 10. Release

### 10.1 Fonte de versão

`Directory.Build.props` continua como fonte canônica da versão Windows/release.

Nenhum `.csproj`, workflow ou instalador deve manter versão duplicada hardcoded que possa divergir.

### 10.2 Relação CI → tag → release

A release somente pode ser criada quando:

- CI do commit concluiu com sucesso;
- branch validada é `main`;
- mensagem de commit é exatamente `release: v<Version>`;
- notas `docs/releases/v<Version>.md` existem;
- artifacts vêm do mesmo `workflow_run` verde.

Ao criar a release/tag, o workflow deve passar explicitamente o SHA validado como target.

Exemplo conceitual:

```text
gh release create vX.Y.Z --target <workflow_run.head_sha> ...
```

Se a tag já existir:

- validar que ela aponta para o mesmo SHA;
- se divergir, falhar;
- nunca reutilizar silenciosamente uma tag apontando para outro commit.

Isso elimina a janela de corrida entre avanço da `main` e criação da tag.

## 11. Segurança web

A CSP atual permanece restritiva.

Invariantes mínimos:

- `default-src 'self'`;
- `frame-ancestors 'none'`;
- `object-src 'none'`;
- `connect-src` limitado ao site e `http://127.0.0.1:17345`;
- `script-src 'self'`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- `Permissions-Policy` sem câmera/microfone/geolocalização;
- sem relaxamento por `unsafe-inline`/`unsafe-eval` salvo necessidade comprovada e aprovada separadamente.

## 12. Testes de regressão obrigatórios

A rodada deve adicionar ou manter testes que cubram explicitamente:

### App/Bridge

- Bridge iniciado pelo App e lease adquirido;
- adoção de Bridge gerenciado existente;
- segunda instância do App não interfere no controlador atual;
- `Sair` encerra o Bridge adotado/gerenciado;
- processo estranho com nome semelhante não é morto;
- lease expirado encerra Bridge gerenciado órfão;
- queda inesperada dispara restart com backoff;
- crash-loop abre circuit breaker;
- status do tray acompanha health real.

### Portal

- uma operação por vez;
- reconexão após disconnect IPC;
- cooldown após falha fatal;
- sucesso após cooldown limpa falha anterior;
- cancelamento chega ao runner/helper;
- conclusão tardia não sobrescreve cancelamento;
- expiração terminal remove XML/estado;
- helper encerra quando owner/Bridge desaparece.

### Release/CI

- versão única/canônica;
- Setup recebe versão por parâmetro;
- workflow não contém versões históricas hardcoded;
- release usa explicitamente o SHA validado como target;
- tag divergente causa falha;
- `npm ci` obrigatório;
- gate high/critical presente;
- CSP/headers presentes.

### Build

- build Portal sem `MSB3277` de `WindowsBase`;
- builds App/Bridge/Portal sem warnings bloqueantes definidos pela política;
- pacote Windows contém os três executáveis esperados.

## 13. Documentação

Ao final devem ser atualizados, conforme aplicável:

- `README.md`;
- `docs/architecture/bridge-security.md`;
- `docs/testing/acceptance.md`;
- `docs/testing/bridge-updater.md`;
- notas da próxima release somente quando a release for solicitada;
- esta spec e o plano de implementação devem refletir o estado final.

A lista da API local deve incluir também:

- `POST /api/v1/portal/cancel/{operationId}`.

## 14. Estratégia de implementação

A implementação será dividida em blocos independentes, cada um usando TDD:

1. controle/lease do Bridge;
2. shutdown/adoption/restart no tray;
3. Portal reconectável + cooldown;
4. cancelamento end-to-end do Portal;
5. dependências/npm audit;
6. resolução do warning WindowsBase;
7. CI/release hardening;
8. documentação;
9. revisão adversarial final;
10. CI final completo.

Cada bloco começa com teste que falha pelo motivo esperado e termina com teste verde antes do próximo bloco.

## 15. Critérios de aceite

A rodada de estabilização só pode ser declarada concluída quando todos os itens abaixo forem verdadeiros:

- CI final do HEAD concluído com sucesso;
- web tests verdes;
- .NET tests verdes;
- build web verde;
- build Bridge verde;
- build Portal verde sem conflito `WindowsBase`;
- build App verde;
- Windows package/Setup verde;
- zero vulnerabilidades npm `high`/`critical` segundo o gate do CI;
- release workflow explicitamente amarrado ao SHA validado;
- lifecycle App/Bridge coberto por testes de ownership, shutdown e crash-loop;
- Portal coberto por testes de reconexão, cooldown, cancelamento e expiração;
- documentação alinhada ao código;
- nenhuma funcionalidade fora de escopo introduzida.

O teste físico em Windows real continua necessário antes de declarar uma versão validada em produção, pois CI não substitui A1 real, SEFAZ real, WebView2/hCaptcha e comportamento dos navegadores no Windows.
