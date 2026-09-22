# NFe Agendamento 2.0

Aplicação interna para consultar NF-e, obter o XML oficial e gerar/visualizar DANFE.

## Arquitetura atual

A `main` usa somente site + extensão Chromium:

```text
Site NFe Agendamento
        ↓
Extensão Chromium MV3
        ↓
Consulta direta NFeDistribuicaoDFe
        ├─ 138 + XML → conclui
        ├─ 217 → Portal somente para esta NF-e
        └─ 656 / 429 / proteção → Portal
                                  ↓
                         Portal Nacional da NF-e
                                  ↓
                         hCaptcha manual + A1
```

Não existe Bridge, helper WebView2, instalador Windows ou backend fiscal na Cloudflare.

## Fluxo de consulta

1. o site valida a chave e verifica a extensão;
2. a extensão tenta primeiro o serviço oficial `NFeDistribuicaoDFe`;
3. `138` com `procNFe` válido conclui sem abrir o Portal;
4. `217` abre o Portal somente para aquela NF-e;
5. `656`, HTTP 429 ou proteção local mudam a rota para Portal durante a janela de proteção;
6. no Portal, o hCaptcha é resolvido manualmente;
7. o XML é validado contra a chave e devolvido ao site;
8. o site executa parser, regras de apresentação e DANFE.

Não existe retry fiscal automático após uma tentativa ambígua.

## Consulta em lote

O lote é estritamente sequencial.

- começa pela SEFAZ;
- um `217` usa Portal somente no item afetado e depois tenta SEFAZ novamente no próximo;
- `656`/429/proteção local coloca os itens restantes no Portal;
- existe no máximo uma consulta fiscal ou operação Portal ativa por vez.

## Certificado A1 e CNPJ fiscal

O site e a extensão não importam, exportam ou armazenam PFX/P12, senha ou chave privada.

Para montar o `distDFeInt`, o CNPJ do A1 precisa ser informado uma única vez nas opções da extensão. Esse CNPJ fica somente em `chrome.storage.local`.

A autenticação TLS cliente continua sob responsabilidade do Chrome/Edge e do Windows.

## Proteção fiscal local

A extensão preserva a regra local do Bridge antigo:

- máximo de 20 tentativas diretas por hora por CNPJ;
- tentativa contabilizada antes da comunicação fiscal;
- `656` ou HTTP 429 bloqueiam consulta direta por uma hora;
- estado local ilegível falha de forma conservadora para Portal por uma janela.

A antiga coordenação compartilhada multi-PC do Bridge não foi reintroduzida.

## Regras privadas de fornecedor

CNPJ/CPF real de fornecedor não faz parte do bundle público. A configuração privada é importada explicitamente nas opções da extensão e fica em `chrome.storage.local`. O site recebe apenas o `supplierId` lógico.

## Extensão

Manifest V3, versão de desenvolvimento atual: **0.2.6**.

Permissões:

- `scripting`;
- `storage`;
- `webRequest`.

Hosts:

- `https://nfeagendamento.joaolds.xyz.br/*`;
- `https://www.nfe.fazenda.gov.br/*`;
- `https://www1.nfe.fazenda.gov.br/*`.

Não são usados `<all_urls>`, Native Messaging, `downloads`, `webRequestBlocking` ou acesso genérico ao sistema de arquivos.

## Cloudflare

O Worker serve somente os assets do site. Chaves, XML, CNPJ fiscal e certificado não passam pela Cloudflare no fluxo de consulta.

## Desenvolvimento e validação

```bash
npm ci
npm audit --audit-level=high
npm run lint:web
npm run format:check:web
npm run test:web
npm run coverage:web
npm run build:web
npm run test:extension
npm run build:extension
npm test --prefix tests/playwright
./node_modules/.bin/wrangler deploy --dry-run
```

O CI possui os gates `web`, `extension` e `danfe-print`. CodeQL analisa JavaScript/TypeScript.

## Releases

A próxima release desta arquitetura é a **v0.0.28**, com extensão **0.2.6**.

A seta do site baixa o asset estável `NFeAgendamento-Extension.zip`; a release também preserva o ZIP versionado.

A v0.0.27 permanece como a última versão em que o Portal ainda era a rota principal.

## Aceitação física

O checklist vigente está em `docs/testing/acceptance.md`. Além dos testes de Portal, a consulta direta precisa ser validada fisicamente em Chrome e Edge porque a negociação real do certificado A1 ocorre no navegador/Windows.
