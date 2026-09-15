# Plano de hardening fiscal e manutenção — 15/09/2026

Arquitetura preservada: **site estático + App/Bridge local por PC**. O objetivo é reduzir risco fiscal e de manutenção sem reescrever o produto.

## Princípios

- certificado A1 e chave privada permanecem somente no Windows/Bridge;
- nenhuma regra visual altera o XML original;
- consulta fiscal continua serializada e sem retry automático após resultado ambíguo;
- mudanças entram em etapas pequenas, com regressões automatizadas;
- Portal/hCaptcha continua com intervenção humana somente no hCaptcha;
- documentação e testes acompanham a implementação.

## Referências técnicas

- NT 2026.004 v1.01 — CNPJ e Chave de Acesso alfanuméricos;
- NT Conjunta DFe 2025.001 — DV alfanumérico e código de barras híbrido CODE-128C/CODE-128A;
- MOC 7.0 / Manual do DANFE e FAQ oficial da NF-e — colunas e conteúdo mínimo das folhas adicionais;
- NT 2025.002 v1.51 e schemas oficiais vigentes — Reforma Tributária do Consumo (IBS/CBS).

## Fase 1 — CNPJ e chave de acesso alfanuméricos

**Status: concluída e validada no CI.**

Implementado no site, lote, Bridge, certificado A1, SOAP `NFeDistribuicaoDFe` e helper Portal, preservando compatibilidade com chaves/CNPJs numéricos.

A interface também foi alinhada ao novo contrato: mostra **44 caracteres**, deixa de forçar teclado numérico, remove a menção ao antigo teto fixo de 10 chaves no placeholder do lote e o diagnóstico local passa a ocultar chaves alfanuméricas de 44 posições.

## Fase 2 — conformidade e impressão do DANFE

**Status: implementação automatizada concluída; falta somente aceitação física A4 antes da próxima release.**

Entregue:

- `NCM/SH` restaurado na grade;
- coluna interna `Item` movida para depois da descrição;
- folhas adicionais repetem cabeçalho, Natureza da Operação e identificação fiscal do emitente;
- código de barras híbrido CODE-128C/CODE-128A para chave alfanumérica;
- representação textual da chave preserva letras;
- área do código de barras ampliada;
- paginação determinística recalibrada para a grade mais estreita e cabeçalhos adicionais;
- `products-filler` preservada;
- CSS morto de `.danfe-measuring` removido;
- regressões unitárias atualizadas.

Critério restante para fechar fisicamente a fase: executar o checklist A4 em Windows/impressora real.

## Fase 3 — teste real de impressão com Playwright

**Status: concluída e validada no CI.**

Implementado Playwright em versão fixa e isolado em `tests/playwright`, com lockfile próprio. O CI instala somente Chromium e executa o job `danfe-print` para gerar PDFs A4 e validar:

1. número de folhas;
2. ordem dos itens;
3. cabeçalhos obrigatórios nas continuações;
4. NCM/SH e código de barras;
5. ausência de overflow/cortes;
6. NF-e curta e longa;
7. chave alfanumérica.

Os artifacts do teste ficam disponíveis temporariamente no workflow. Esse gate encontrou e evitou uma diferença real de paginação durante a implantação. A validação física continua obrigatória porque driver e margens não imprimíveis variam por impressora.

## Fase 4 — adoção incremental do Unimake.DFe

**Status: POC isolado implementado e validado no CI; biblioteca ainda não está no caminho de produção.**

Entregue:

- `Unimake.DFe` fixado na versão `20260908.1441.34` dentro de `tests/unimake-poc`;
- auditoria NuGet habilitada no POC;
- comparação entre nosso `AccessKey` e `XMLUtility` para chave numérica, chave com CNPJ alfanumérico e DV inválido;
- validação do reconhecimento de CNPJ alfanumérico e do cálculo de DV;
- confirmação em compilação da presença dos tipos NFe `IBSCBS` e `IBSCBSTot`;
- job `fiscal-compatibility` obrigatório antes do pacote Windows.

Próximos passos dessa fase:

1. comparar serialização/desserialização de XMLs RTC representativos;
2. usar a biblioteca como oráculo adicional em testes de schema/paridade;
3. introduzir adaptador de produção somente quando um componente específico demonstrar benefício e paridade;
4. substituir componentes manuais apenas de forma incremental.

Bridge, Portal, UI, regras de fornecedores e renderer DANFE permanecem sob nosso controle.

## Fase 5 — RTC / IBS / CBS

**Status: suporte estrutural inicial implementado; integração visual/fiscal avançada ainda pendente.**

Entregue:

- fixture sintética RTC sem dados pessoais reais;
- parser complementar `apps/web/src/nfe/rtc.ts`;
- modelo dos campos centrais de `IBSCBS`, `gIBSUF`, `gIBSMun`, `gCBS`, `IS`, `IBSCBSTot`, `ISTot` e `vNFTot`;
- wrapper `parseNfeXmlWithRtc` que preserva o objeto NF-e existente e o XML original;
- sinalização explícita de grupos estendidos conhecidos, como `gIBSCBSMono`, para evitar tratamento silencioso como cenário básico;
- testes de compatibilidade com NF-e legada, chave divergente, valores RTC e grupo monofásico.

Pendente:

- ampliar fixtures para cenários RTC/monofásicos realmente necessários ao uso do projeto;
- comparar esses XMLs com schemas oficiais e com o POC Unimake;
- mapear exatamente o que o DANFE vigente exige antes de imprimir novos campos;
- conectar o wrapper RTC ao fluxo principal somente depois dessa validação.

Detalhes: `docs/architecture/rtc-ibs-cbs.md`.

## Fase 6 — privacidade, multi-PC e supply chain

**Status: parcialmente iniciado.**

Concluído:

- `.gitignore` passou a bloquear preventivamente `*.pfx`, `*.p12`, `*.pem` e `*.key`;
- etapas que recebem secrets de Authenticode agora só executam em `push` confiável para `main`, não em builds de pull request.

Pendente:

- retirar identificadores internos/pessoais do bundle público sem quebrar as regras operacionais por fornecedor;
- tratar o limite SEFAZ por CNPJ entre vários PCs sem reintroduzir PC central;
- configurar certificado real de Authenticode e, idealmente, ambiente protegido de release;
- proteger `main` contra force-push/deleção e adotar checks obrigatórios quando compatível com o fluxo;
- alinhar versão, release e artefatos após as fases fiscais restantes.

## Critério de release

Nova release somente quando:

- CI inteiro estiver verde no mesmo SHA;
- regressões alfanuméricas passarem;
- DANFE A4 passar em teste automatizado e físico;
- consulta SEFAZ, Portal, lote, XML e atualização não regredirem;
- documentação estiver alinhada ao comportamento publicado.
