# NFe Agendamento 2.0

Aplicação interna para consultar NF-e, obter o XML oficial e gerar/visualizar DANFE.

## Arquitetura atual

A `main` usa somente:

```text
Site NFe Agendamento
        ↓
Extensão Chromium MV3
        ↓
Popup Chrome/Edge
        ↓
Portal Nacional da NF-e
        ↓
A1 instalado no Windows, quando o Portal solicitar
```

O Bridge Windows, helper WebView2, consulta direta `NFeDistribuicaoDFe`, instalador Inno Setup e coordenação fiscal Cloudflare foram removidos da arquitetura atual.

## Fluxo de consulta

1. o site valida a chave de acesso;
2. verifica se a extensão está conectada;
3. a extensão abre o Portal Nacional em um popup do navegador;
4. a chave é preenchida;
5. o usuário resolve o hCaptcha manualmente;
6. o Chrome/Edge usa o certificado A1 instalado no Windows quando o Portal solicitar;
7. a extensão observa somente o download oficial do XML;
8. o XML é validado contra a chave e devolvido ao site;
9. o site executa parser, regras de apresentação e DANFE.

Não existe solver/bypass de captcha e não existe fallback nativo oculto.

## Consulta em lote

O lote é estritamente sequencial. Cada NF-e conclui todo o fluxo do Portal antes da próxima começar. A extensão mantém no máximo uma operação Portal ativa.

## Certificado A1

O site e a extensão não enumeram, importam, exportam nem armazenam PFX/P12, senha ou chave privada. A seleção/uso do certificado cliente fica a cargo do Chrome/Edge e do Windows.

## Regras privadas de fornecedor

CNPJ/CPF real de fornecedor não faz parte do bundle público. A configuração privada é importada explicitamente na página de opções da extensão e fica em `chrome.storage.local`, restrito aos contextos confiáveis da extensão. O site recebe apenas o `supplierId` lógico.

## Extensão

Manifest V3, versão de desenvolvimento atual: **0.2.4**.

Permissões:

- `scripting`;
- `storage`;
- `webRequest`.

Hosts:

- `https://nfeagendamento.joaolds.xyz.br/*`;
- `https://www.nfe.fazenda.gov.br/*`.

Não são usados `<all_urls>`, Native Messaging, `downloads`, `webRequestBlocking` ou acesso genérico ao sistema de arquivos.

## Cloudflare

O Worker atual serve os assets do site. As rotas de coordenação fiscal e atualização Windows foram removidas porque ficaram sem consumidor na arquitetura extension-only.

O antigo Durable Object `FiscalCoordinator` fica temporariamente declarado como tombstone `deleted` em `wrangler.jsonc` até a Cloudflare reconciliar a exclusão do namespace.

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

O CI vigente possui apenas os gates `web`, `extension` e `danfe-print`. CodeQL analisa JavaScript/TypeScript.

## Releases

A próxima release publica somente o ZIP da extensão validado pelo mesmo SHA do CI. O site é implantado pelo fluxo Cloudflare do repositório.

A **v0.0.25** permanece como registro da última release híbrida que ainda incluía Bridge/Windows. Ela não representa mais a arquitetura da `main`.

Histórico de releases e planos antigos é preservado em `docs/releases/` e `docs/superpowers/`.

## Aceitação física

O checklist vigente está em `docs/testing/acceptance.md`. Os pontos essenciais são Chrome e Edge, extensão conectada, hCaptcha manual, A1 pelo navegador, XML/DANFE, segunda consulta, cancelamento e lote sequencial.
