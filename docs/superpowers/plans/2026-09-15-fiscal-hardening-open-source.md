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
- NT 2025.002 e versões posteriores — Reforma Tributária do Consumo (IBS/CBS).

## Fase 1 — CNPJ e chave de acesso alfanuméricos

**Status: concluída e validada no CI.**

Implementado no site, lote, Bridge, certificado A1, SOAP `NFeDistribuicaoDFe` e helper Portal, preservando compatibilidade com chaves/CNPJs numéricos.

## Fase 2 — conformidade e impressão do DANFE

**Status: implementada; aguardando CI e validação física.**

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

Critério para fechar a fase: `web`, `bridge` e `windows-package` verdes no mesmo SHA e checklist físico A4 executado.

## Fase 3 — teste real de impressão com Playwright

**Próxima etapa.**

Adicionar `@playwright/test` em versão fixa ao workspace e ao `package-lock.json`. O CI deverá instalar apenas Chromium e gerar PDF A4 com fixtures representativas para verificar:

1. número de folhas;
2. ordem dos itens;
3. cabeçalhos obrigatórios nas continuações;
4. NCM/SH e código de barras;
5. ausência de overflow/cortes;
6. NF-e curta, longa, fornecedor com linhas internas e lote.

Não usar `npx` flutuante. A dependência entra somente com lockfile revisado.

## Fase 4 — adoção incremental do Unimake.DFe

1. criar testes de paridade entre nossas rotinas e a biblioteca;
2. validar explicitamente CNPJ/chave alfanuméricos e schemas vigentes;
3. introduzir a biblioteca atrás de interface própria;
4. comparar com XMLs já aceitos pelo sistema;
5. substituir componentes manuais apenas onde houver paridade comprovada.

Bridge, Portal, UI, regras de fornecedores e renderer DANFE permanecem sob nosso controle.

## Fase 5 — RTC / IBS / CBS

- adicionar fixtures dos grupos atuais;
- ampliar o modelo XML sem remover campos existentes;
- mapear o que o DANFE vigente exige antes de exibir novos campos;
- impedir perda silenciosa de informação fiscal relevante.

## Fase 6 — privacidade, multi-PC e supply chain

- retirar identificadores internos/pessoais do bundle público;
- tratar o limite SEFAZ por CNPJ entre vários PCs sem reintroduzir PC central;
- configurar Authenticode em fluxo de release confiável;
- isolar segredos de assinatura de builds de PR;
- proteger `main` contra force-push/deleção e adotar checks obrigatórios quando compatível com o fluxo;
- alinhar versão, release e artefatos.

## Critério de release

Nova release somente quando:

- CI inteiro estiver verde no mesmo SHA;
- regressões alfanuméricas passarem;
- DANFE A4 passar em teste automatizado e físico;
- consulta SEFAZ, Portal, lote, XML e atualização não regredirem;
- documentação estiver alinhada ao comportamento publicado.
