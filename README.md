# NFe Agendamento 2.0

Aplicação interna para consultar NF-e, obter o XML oficial e gerar/visualizar DANFE.

## Arquitetura atual

O produto continua sem Bridge/EXE. O componente local único é a extensão Chromium:

```text
Site NFe Agendamento
        ↓
Extensão Chromium MV3
        ├── 1. janela interna de autenticação TLS
        │      ↓ Chrome/Edge usa o A1 do Windows
        ├── 2. NFeDistribuicaoDFe / SEFAZ
        │      ↓ sucesso: XML
        │
        └── 3. Portal Nacional somente como fallback
               ↓
             hCaptcha manual
               ↓
              XML
```

A consulta direta é a rota principal. O Portal Nacional não abre quando a SEFAZ devolve o XML.

## Regra de fallback

A lógica segue a usada pelo antigo Bridge:

- **sucesso / cStat 138 com procNFe**: conclui pela SEFAZ;
- **cStat 217**: somente aquela NF-e segue para o Portal;
- **cStat 656, HTTP 429 ou limite local**: a proteção fiscal é ativada e a NF-e atual mais as próximas do lote seguem pelo Portal;
- **falha de transporte, timeout ou resposta tecnicamente inválida**: não existe retry automático nem fallback oculto.

O lote é sempre sequencial.

## Proteção fiscal local

A extensão mantém em `chrome.storage.local`:

- CNPJ correspondente ao certificado A1;
- histórico local das tentativas diretas;
- cooldown fiscal.

Limites atuais, iguais à proteção local do Bridge:

- máximo de **20 tentativas diretas por hora**;
- cooldown de **1 hora** após 656/429 ou quando o limite local é atingido.

A antiga coordenação multi-PC por Cloudflare não foi reativada nesta etapa. Portanto, a proteção desta versão é por navegador/computador e precisa de validação física antes de qualquer decisão sobre coordenação compartilhada.

## Certificado A1

A extensão não lê, importa, exporta nem armazena PFX/P12, senha ou chave privada.

Como o Chromium no Windows não expõe à extensão a identidade do certificado cliente, o **CNPJ da empresa vinculada ao A1 é informado uma única vez nas opções da extensão** e permanece local. Esse CNPJ é usado apenas como identidade do interessado no SOAP; ele não substitui o certificado.

A partir da extensão **0.2.10**, a chamada direta não é mais iniciada pelo service worker MV3. A extensão abre uma janela interna curta e faz a conexão com a SEFAZ a partir desse contexto visível. Assim o Chrome/Edge pode apresentar o seletor de certificado cliente e usar o A1 instalado no Windows. A janela fecha ao concluir. Se houver política de seleção automática de certificado configurada no navegador, a escolha pode ocorrer sem intervenção; a extensão não altera políticas do Windows/Chrome/Edge.

Clicar no ícone da extensão abre a configuração do CNPJ. O site também faz um **preflight** antes de consultar: se o CNPJ ainda não estiver configurado, a tela de opções é aberta automaticamente e nenhuma consulta é enviada à SEFAZ. Em lote, nenhuma NF-e é marcada como erro ou cancelada por essa ausência. O preflight fica bloqueado durante a verificação para impedir início duplicado por duplo clique. Extensões anteriores à 0.2.8 recebem orientação de atualização/configuração manual em vez de uma confirmação falsa de abertura.

## Portal Nacional

O Portal é fallback. Quando necessário:

1. a extensão abre um popup oficial;
2. preenche a chave;
3. o usuário resolve o hCaptcha manualmente;
4. o navegador usa o A1 quando solicitado;
5. a extensão captura o download oficial dentro da própria sessão autenticada;
6. o XML é validado contra a chave e devolvido ao site.

Não existe solver/bypass de captcha.

## Regras privadas de fornecedor

CNPJ/CPF real de fornecedor não faz parte do bundle público. A configuração privada é importada na página de opções da extensão e fica em `chrome.storage.local`. O site recebe apenas o `supplierId` lógico.

## Extensão

Versão na `main`: **0.2.10**.

Permissões:

- `scripting`;
- `storage`;
- `webRequest`.

Hosts:

- `https://nfeagendamento.joaolds.xyz.br/*`;
- `https://www.nfe.fazenda.gov.br/*`;
- `https://www1.nfe.fazenda.gov.br/*`.

Sem `<all_urls>`, Native Messaging, `downloads`, `webRequestBlocking` ou acesso genérico ao sistema de arquivos.

## Cloudflare

O Worker serve o site. A consulta fiscal acontece no navegador/extensão; XML, certificado e CNPJ do A1 não são enviados ao Worker pelo fluxo de consulta.

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

A `main` contém a extensão **0.2.10**, que move a autenticação TLS da consulta direta para uma janela interna da extensão para permitir que Chrome/Edge selecionem o A1 instalado no Windows. Essa alteração ainda precisa do gate físico antes de uma nova release.

A última release publicada é a **v0.0.32**, ainda com extensão **0.2.9**. Ela restaura corretamente ações de resultados anteriores após o preflight e bloqueia reconsulta pelo Portal enquanto a configuração fiscal está sendo verificada.

A v0.0.31/extensão 0.2.9 endureceu o preflight contra duplo clique e compatibilidade com versões antigas. A v0.0.30/extensão 0.2.8 introduziu o preflight automático. A v0.0.29/extensão 0.2.7 corrigiu o layout da configuração local. A v0.0.28/extensão 0.2.6 foi a primeira release direct-first.

A seta do site baixa sempre `NFeAgendamento-Extension.zip` da release mais recente.

## Aceitação física

A consulta direta com A1 pelo Chrome/Edge é um gate físico: os testes automatizados validam protocolo, SOAP, parsing, proteção e roteamento, mas não conseguem provar a negociação real do certificado cliente com a SEFAZ.

Checklist: `docs/testing/acceptance.md`.
