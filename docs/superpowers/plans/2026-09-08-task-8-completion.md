# Task 8 — Fallback Portal/WebView2

Data: 08/09/2026

## Status

**Implementação automatizável concluída.** A validação física do Portal/hCaptcha em Windows permanece como teste de aceitação explícito e não é inferida a partir do CI.

## Implementado

- `POST /api/v1/portal/start` cria operação local e efêmera;
- `GET /api/v1/portal/status/{operationId}` devolve estado e XML somente após conclusão;
- operações desconhecidas não são reutilizadas;
- resultado temporário é limitado a 10 MiB e validado contra a chave solicitada;
- helper Windows separado `NfeAgendamento.Portal.exe` em WinForms + WebView2;
- URL de topo restrita ao Portal Nacional da NF-e (`www.nfe.fazenda.gov.br`);
- navegação externa e novas janelas externas são bloqueadas;
- o certificado do Portal é escolhido pelo thumbprint selecionado no site;
- somente o endpoint oficial `/portal/downloadNFe.aspx` é aceito para captura do XML;
- XML baixado é validado como `nfeProc`, com `infNFe/@Id` igual à chave pedida;
- arquivo temporário é removido após handoff/cancelamento;
- hCaptcha permanece manual; não existe chamada `hcaptcha.execute`, `grecaptcha.execute` ou bypass equivalente;
- frontend inicia o fallback apenas após `consumption_limit` e não executa uma segunda consulta `NFeDistribuicaoDFe`;
- XML concluído passa pelo mesmo `parseNfeXml` → Fernando Klein → DANFE do fluxo normal;
- estados de Portal concluído, cancelado e falho estão tratados na UI.

## Evidência automatizada

No run GitHub Actions `34252884720` (commit `f6d329e3b9ec9fbcb3d8b5787ac665623c917538`):

- web tests: PASS;
- Vite/TypeScript build: PASS;
- Wrangler deploy dry-run: PASS;
- Bridge xUnit: PASS;
- Bridge Release build: PASS;
- helper `net10.0-windows` build: PASS.

Depois disso, a Task 9 adicionou regressões de readiness e empacotamento Windows sem alterar a arquitetura da Task 8.

## Aceitação física ainda necessária

Executar `docs/testing/acceptance.md`, especialmente:

1. abrir o Portal em Windows real;
2. confirmar carregamento WebView2;
3. resolver hCaptcha manualmente;
4. confirmar seleção do A1 real;
5. baixar XML oficial;
6. confirmar retorno automático ao site e DANFE;
7. confirmar cancelamento ao fechar a janela;
8. confirmar bloqueios de navegação/download externos.

Não provocar artificialmente 656 por consultas repetidas; usar ocorrência natural ou cenário controlado disponível.
