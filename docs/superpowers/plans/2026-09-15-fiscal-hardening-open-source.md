# Plano de hardening fiscal e manutenção — 15/09/2026

Base usada para o plano: `main` em `7a511ce1d650de3f2210fb1491c140235a902232`.

## Objetivo

Evoluir o NFe Agendamento sem trocar a arquitetura aprovada (**site estático + App/Bridge local por PC**), reduzindo código fiscal proprietário e fechando os gaps encontrados na auditoria de 15/09/2026.

Princípios:

- certificado A1 e chave privada permanecem somente no Windows/Bridge;
- nenhuma regra visual altera o XML original;
- consulta fiscal continua serializada e sem retry automático após resultado ambíguo;
- mudanças fiscais entram em etapas pequenas, com regressões automatizadas antes de substituir código já validado;
- Portal/hCaptcha continua com intervenção humana exclusivamente no hCaptcha;
- documentação e testes devem acompanhar o mesmo commit da implementação.

## Referências oficiais

- Portal NF-e — NT 2026.004 v1.01: adequação de NF-e/NFC-e ao CNPJ alfanumérico;
- NT Conjunta DFe 2025.001: cálculo dos DVs e código de barras híbrido CODE-128C/CODE-128A;
- MOC 7.0 / Manual do DANFE: colunas mínimas e conteúdo obrigatório das folhas adicionais;
- NT 2025.002 e versões posteriores: Reforma Tributária do Consumo (IBS/CBS).

## Fase 1 — CNPJ e chave de acesso alfanuméricos

**Prioridade P0.**

Escopo:

1. aceitar o formato oficial de chave com 44 caracteres (`[0-9]{6}[A-Z0-9]{12}[0-9]{26}`);
2. calcular DV da chave usando o valor ASCII do caractere menos 48, preservando compatibilidade com chaves numéricas;
3. aceitar CNPJ alfanumérico de 14 posições, validar seus dois DVs e normalizar para maiúsculas;
4. aplicar a mesma regra no site, lote, Bridge, certificado A1, SOAP `NFeDistribuicaoDFe` e helper Portal;
5. manter comparação estrita entre a chave solicitada e `infNFe/@Id`;
6. adicionar fixtures/regressões com chave e CNPJ alfanuméricos conhecidos.

Status: **em execução neste conjunto de mudanças**.

## Fase 2 — conformidade e impressão do DANFE

**Prioridade P1.**

Escopo:

- restaurar `NCM/SH` entre as colunas obrigatórias;
- manter a coluna interna `Item`, porém à direita da descrição para não alterar a ordem fiscal remanescente;
- folhas adicionais repetirem identificação do emitente, DANFE, número/série/folha, código de barras, Natureza da Operação, Chave de Acesso, IE/IE ST e CNPJ/CPF;
- gerar código de barras híbrido CODE-128C/CODE-128A quando a chave contiver letras;
- preservar paginação determinística e `products-filler`;
- incluir regressões de página adicional e de código de barras alfanumérico.

Status: **próxima etapa imediata após a Fase 1 ficar verde no CI**.

## Fase 3 — teste real de impressão com Playwright

Adicionar Playwright de forma pinada ao workspace e ao lockfile. O CI deverá:

1. instalar somente Chromium;
2. renderizar fixtures representativas;
3. gerar PDF A4;
4. verificar número de folhas, ordem dos itens e ausência de overflow/cortes;
5. cobrir NF-e curta, NF-e longa, fornecedor com linhas internas e lote com duas notas.

A dependência só entra após atualização explícita e revisada do `package-lock.json`; não será usada via `npx` flutuante.

## Fase 4 — adoção incremental do Unimake.DFe

O Unimake.DFe será usado como biblioteca fiscal, sem reescrever o produto de uma vez.

Sequência:

1. criar testes de paridade entre nossas rotinas e o Unimake para chave/CNPJ/XML;
2. usar a biblioteca como validador/parser fiscal por trás de uma interface nossa;
3. comparar os resultados com os XMLs reais já aceitos pelo sistema;
4. somente então avaliar substituir partes manuais de schema/protocolo;
5. Bridge, Portal, UI, regras de fornecedores e renderer DANFE continuam sob nosso controle.

Critério: nenhuma migração de protocolo será feita sem paridade automatizada e regressão do fluxo atual.

## Fase 5 — RTC / IBS / CBS

- adicionar fixtures oficiais/representativas com os novos grupos;
- ampliar o modelo de XML sem remover campos existentes;
- mostrar no DANFE apenas o que o leiaute vigente exigir;
- impedir perda silenciosa de informação relevante durante parsing.

## Fase 6 — privacidade, operação multi-PC e supply chain

- retirar dados internos/sensíveis do bundle público quando houver uma forma segura de distribuir as regras de fornecedor sem quebrar o uso offline/local;
- tratar o limite fiscal por CNPJ entre PCs sem reintroduzir a antiga arquitetura de PC central;
- configurar Authenticode para App/Bridge/Portal/Setup;
- proteger `main` com required checks/ruleset;
- versionar a próxima release somente depois do checklist físico completo.

## Critério de conclusão

Uma nova release só será criada quando:

- `web`, `bridge` e `windows-package` estiverem verdes no mesmo SHA;
- regressões alfanuméricas passarem;
- DANFE A4 estiver correto em teste automatizado e físico;
- consulta SEFAZ, fallback Portal, lote, XML e atualização não regredirem;
- documentação de aceitação estiver atualizada para o comportamento novo.
