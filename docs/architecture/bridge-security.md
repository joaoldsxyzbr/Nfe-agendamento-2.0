# Segurança do Bridge local

## Objetivo

O Bridge existe somente para operações que o navegador não consegue executar diretamente: acesso ao certificado A1/chave privada do Windows, transporte autenticado para a SEFAZ e abertura controlada do Portal Nacional da NF-e quando houver limite de consumo.

Ele **não é um servidor de rede** e não deve ser exposto na LAN ou na Internet.

## Fronteiras de confiança

```text
Site HTTPS
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

Todas as chamadas `/api/v1/*` feitas pelo navegador exigem `Origin` explicitamente permitido em `Bridge:AllowedOrigins`. Não existe wildcard e uma lista vazia mantém o Bridge fail-closed.

Exemplo por variável de ambiente para um único site:

```powershell
$env:Bridge__AllowedOrigins__0 = "https://SEU-DOMINIO-EXATO"
.\NfeAgendamento.Bridge.exe
```

Mais de uma origem pode ser configurada usando índices adicionais (`__1`, `__2`, ...), por exemplo durante uma migração de domínio. Use sempre a **origem exata** (`scheme + host + porta quando existir`), sem caminho e sem `*`.

A URL definitiva do Cloudflare deve ser configurada no Bridge antes do teste físico de produção. Não ampliar a allowlist para contornar esse requisito.

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

## Consulta SEFAZ

- uma consulta fiscal gera no máximo uma tentativa de transporte;
- `656`, HTTP `429`, timeout e falha ambígua **não** disparam retry automático;
- resposta/XML é limitada a 10 MiB;
- DTD é proibido e `XmlResolver` fica desabilitado;
- `docZip`/`infNFe` deve corresponder exatamente à chave pedida antes de o XML seguir para o site.

## Portal/WebView2

O helper `NfeAgendamento.Portal.exe` é um processo Windows separado e deve acompanhar o Bridge na distribuição.

Proteções:

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

1. definir a origem HTTPS exata do site em `Bridge:AllowedOrigins`;
2. confirmar que `/health` responde somente com o Origin autorizado;
3. confirmar que um Origin diferente recebe `403`;
4. confirmar que o processo escuta apenas `127.0.0.1:17345`;
5. validar A1 real em `CurrentUser/My`;
6. validar o helper WebView2 no Windows com o Portal oficial;
7. executar `docs/testing/acceptance.md` e registrar os resultados.
