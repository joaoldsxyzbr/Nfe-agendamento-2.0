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
```

O site recebe somente metadados do certificado, status fiscais e XML da NF-e. A chave privada nunca é serializada nem enviada ao site/cloud.

## Rede local

O host ASP.NET Core usa exclusivamente:

```text
http://127.0.0.1:17345
```

O middleware rejeita `Host` diferente de `127.0.0.1:17345`. Não existem `0.0.0.0`, bind LAN, mDNS, pareamento, líder/standby ou servidor central.

## Origin e CORS

Todas as chamadas `/api/v1/*` feitas pelo navegador exigem `Origin` explicitamente permitido em `Bridge:AllowedOrigins`. Não existe wildcard.

A distribuição de produção `v0.0.4` inclui em `appsettings.json` exatamente:

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

Não adicionar wildcard nem origem arbitrária para contornar problemas de implantação.

## Instância única

O executável real do Bridge adquire um mutex nomeado antes de subir o host. Se uma segunda cópia instalada for aberta na mesma sessão, ela encerra antes de criar outro listener em `127.0.0.1:17345`.

A proteção é aplicada ao executável real; hosts in-process usados pelos testes de integração permanecem independentes para não interferir na suíte automatizada.

## API local

A API é versionada em `/api/v1` e expõe somente:

- `GET /health`;
- `GET /certificates`;
- `POST /certificate/select`;
- `POST /nfe/lookup`;
- `POST /portal/start`;
- `GET /portal/status/{operationId}`.

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

No cliente web, os timeouts são separados por classe de operação para não confundir uma consulta fiscal lenta com Bridge indisponível:

- `health`: 2 s;
- certificados/seleção local: 5 s;
- `nfe/lookup`: 50 s;
- start/status do Portal: 8 s por chamada.

Esses limites não criam retry fiscal automático.

## Portal/WebView2

O helper `NfeAgendamento.Portal.exe` é um processo Windows separado e deve acompanhar o Bridge na distribuição.

Antes de declarar `webView2Available=true`, o Bridge executa o helper em modo headless `--probe-runtime`. O helper consulta o WebView2 Runtime e encerra sem abrir janela. Se o helper não existir, o Runtime estiver ausente, o probe falhar ou exceder o timeout curto, o fallback é marcado como indisponível.

Proteções do Portal:

- URL fixa em `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx`;
- navegação de topo restrita ao host oficial;
- novas janelas externas bloqueadas;
- seleção do certificado pelo thumbprint já escolhido no site;
- somente download HTTPS oficial `/portal/downloadNFe.aspx` é aceito;
- XML temporário limitado a 10 MiB, validado contra a chave e apagado após handoff;
- hCaptcha é sempre resolvido manualmente pelo usuário;
- não existe `hcaptcha.execute`, `grecaptcha.execute` ou mecanismo equivalente de bypass.

## Dados persistentes

O projeto não mantém login, usuários, histórico fiscal, banco ou fila. Fora o thumbprint do certificado e os dados internos necessários ao perfil do WebView2, operações de consulta são efêmeras.

## Checklist de produção

Antes de uso real:

1. confirmar que o site é servido exatamente em `https://nfeagendamento.joaolds.xyz.br`;
2. confirmar que `/health` responde com esse `Origin` autorizado;
3. confirmar que um Origin diferente, ausente ou em HTTP recebe `403`;
4. confirmar que o processo escuta apenas `127.0.0.1:17345`;
5. confirmar que uma segunda abertura do executável não cria outra instância/listener;
6. validar A1 real em `CurrentUser/My`;
7. validar que `webView2Available` reflete de fato a presença do WebView2 Runtime;
8. validar o helper WebView2 no Windows com o Portal oficial;
9. executar `docs/testing/acceptance.md` e registrar os resultados.
