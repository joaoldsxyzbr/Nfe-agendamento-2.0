# NFe Agendamento 2.0

Aplicação interna para consultar NF-e pelo Portal Nacional, obter o XML oficial e gerar/visualizar DANFE.

## Arquitetura atual

O fluxo vigente é **site + extensão Chromium**, sem Bridge/EXE e sem consulta direta à SEFAZ:

```text
Site NFe Agendamento
        ↓
Extensão Chromium MV3
        ↓
Portal Nacional da NF-e
        ↓
hCaptcha manual
        ↓
Download oficial do XML
        ↓
Site → validação XML → DANFE/XML
```

Toda consulta abre o Portal Nacional. A extensão preenche a chave, acompanha a sessão do navegador e devolve o XML oficial ao site.

## Portal Nacional

Fluxo nominal:

1. o site valida a chave;
2. a extensão abre um popup oficial do Portal;
3. a chave é preenchida;
4. o usuário resolve o **hCaptcha manualmente**;
5. a extensão acompanha a continuação oficial;
6. o navegador usa o certificado digital quando o Portal exigir;
7. a extensão captura o download oficial dentro da mesma sessão;
8. o XML é limitado, validado contra a chave e devolvido ao site;
9. o site gera DANFE e libera o download do XML.

Não existe solver/bypass de captcha.

## Consulta em lote

O lote também é Portal-only:

- processamento estritamente sequencial;
- uma NF-e por vez;
- no máximo uma janela do Portal ativa;
- cancelamento impede abrir os próximos itens;
- falha de um item não inicia uma segunda rota escondida;
- resultados concluídos podem ser baixados em ZIP ou impressos em conjunto.

Não existem limite/cooldown de consulta direta, porque o projeto não chama mais `NFeDistribuicaoDFe`.

## Certificado digital

A extensão não lê, importa, exporta nem armazena PFX/P12, senha ou chave privada.

Quando o Portal Nacional exigir certificado digital para o download, a autenticação continua sob responsabilidade do Chrome/Edge e do Windows. O projeto não mantém mais CNPJ fiscal de A1 nem configuração de certificado para consulta direta.

## Regras privadas de fornecedor

CNPJ/CPF real de fornecedor não faz parte do bundle público. A configuração privada é importada pela página de opções da extensão e fica em `chrome.storage.local`. O site recebe somente o `supplierId` lógico.

Clicar no ícone da extensão abre essa configuração.

## Extensão

Versão na `main`: **0.2.11**.

Permissões:

- `scripting`;
- `storage`;
- `webRequest`.

Hosts:

- `https://nfeagendamento.joaolds.xyz.br/*`;
- `https://www.nfe.fazenda.gov.br/*`.

Sem `<all_urls>`, Native Messaging, `downloads`, `webRequestBlocking`, acesso genérico ao sistema de arquivos ou host direto `www1.nfe.fazenda.gov.br`.

## Cloudflare

O Worker serve o site. XML, certificado e regras privadas não são enviados ao Worker pelo fluxo de consulta.

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

CI: `web`, `extension` e `danfe-print`. CodeQL analisa JavaScript/TypeScript.

## Releases

A `main` atual contém a arquitetura **Portal-only** e a extensão **0.2.11**.

A última release publicada antes desta mudança é a **v0.0.33 / extensão 0.2.10**, que ainda contém o experimento de consulta direta. Ela permanece apenas como histórico até uma nova release ser publicada explicitamente.

A seta do site baixa sempre `NFeAgendamento-Extension.zip` da release mais recente.

## Aceitação física

O gate físico vigente é o Portal Nacional: popup, chave preenchida, hCaptcha manual, certificado quando exigido, captura do XML, segunda consulta, lote e cancelamento.

Checklist: `docs/testing/acceptance.md`.
