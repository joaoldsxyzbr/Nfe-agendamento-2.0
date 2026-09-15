# Plano de hardening fiscal e manutenção — 15/09/2026

Arquitetura preservada: **site Cloudflare + Worker mínimo de coordenação + App/Bridge local por PC**. O Worker remoto não acessa certificado, chave privada, CNPJ em claro, chave NF-e ou XML; ele existe apenas para coordenar o consumo fiscal entre PCs que usam o mesmo A1 RSA.

## Princípios

- certificado A1 e chave privada permanecem somente no Windows/Bridge;
- nenhuma regra visual altera o XML original;
- consulta fiscal continua serializada e sem retry automático após resultado ambíguo;
- coordenação remota falha fechada: indisponibilidade direciona ao Portal sem tocar na SEFAZ;
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

A interface mostra **44 caracteres**, não força teclado numérico, remove a menção ao antigo teto fixo de 10 chaves no placeholder do lote e o diagnóstico local oculta chaves numéricas ou alfanuméricas de 44 posições.

O produto aceita somente **NF-e modelo 55** e rejeita NFC-e modelo 65 no site e no Bridge.

## Fase 2 — conformidade e impressão do DANFE

**Status: implementação automatizada concluída; falta aceitação física A4 antes da próxima release.**

Entregue:

- `NCM/SH` restaurado na grade;
- coluna interna `Item` depois da descrição;
- folhas adicionais repetem cabeçalho, Natureza da Operação e identificação fiscal do emitente;
- código de barras híbrido CODE-128C/CODE-128A para chave alfanumérica;
- representação textual preserva letras;
- paginação determinística recalibrada;
- `products-filler` preservada;
- CSS morto de `.danfe-measuring` removido;
- regressões unitárias atualizadas.

Critério físico restante: executar o checklist A4 em Windows/impressora real.

## Fase 3 — teste real de impressão com Playwright

**Status: concluída e validada no CI.**

`tests/playwright` usa Chromium real para gerar PDFs A4 e validar número de folhas, ordem dos itens, cabeçalhos das continuações, NCM/SH, código de barras, ausência de overflow, `Folha X/Y` e chave alfanumérica.

A validação física continua obrigatória porque margens não imprimíveis e drivers variam por impressora.

## Fase 4 — adoção incremental do Unimake.DFe

**Status: POC isolado implementado; biblioteca continua fora do caminho de produção.**

Entregue:

- `Unimake.DFe` fixado na versão `20260908.1441.34` em `tests/unimake-poc`;
- NuGet Audit habilitado;
- paridade de chave numérica/alfanumérica e DV;
- reconhecimento de CNPJ alfanumérico;
- presença dos tipos NFe `IBSCBS` e `IBSCBSTot`;
- fixture RTC sintética submetida a desserialização/serialização com `NfeProc` e preservação dos grupos centrais;
- job `fiscal-compatibility` obrigatório antes do pacote Windows.

A biblioteca permanece como oráculo adicional de compatibilidade. Produção só deve adotar componentes específicos após paridade demonstrada.

## Fase 5 — RTC / IBS / CBS

**Status: suporte estrutural inicial concluído; evolução fica condicionada a casos reais e ao leiaute oficial vigente.**

Entregue:

- fixture sintética RTC sem dados pessoais reais;
- parser complementar `apps/web/src/nfe/rtc.ts`;
- modelo dos campos centrais de `IBSCBS`, `gIBSUF`, `gIBSMun`, `gCBS`, `IS`, `IBSCBSTot`, `ISTot` e `vNFTot`;
- wrapper `parseNfeXmlWithRtc` preservando o objeto NF-e e o XML original;
- sinalização de grupos estendidos como `gIBSCBSMono`;
- testes de compatibilidade com NF-e legada, chave divergente, valores RTC e grupo monofásico;
- paridade da fixture básica com o POC Unimake.

Não serão impressos campos RTC novos no DANFE sem exigência explícita do leiaute vigente e fixture representativa do uso real.

Detalhes: `docs/architecture/rtc-ibs-cbs.md`.

## Fase 6 — privacidade, multi-PC e supply chain

**Status de código: concluído. Dependências externas de conta/certificado permanecem separadas.**

Concluído no repositório:

- `.gitignore` bloqueia `*.pfx`, `*.p12`, `*.pem` e `*.key`;
- secrets de Authenticode não entram em builds de pull request;
- `FiscalUsageGuard` local grava estado de forma durável e falha conservadoramente se o estado estiver ilegível;
- regras especiais de fornecedores não carregam CPF/CNPJ fixos no bundle público e usam aliases exatos do `xNome` normalizado;
- Worker Cloudflare mínimo em `worker/index.ts` coordena a janela de consumo por Durable Object SQLite;
- a reserva compartilhada acontece antes da chamada fiscal;
- o Bridge deriva uma credencial opaca de alta entropia usando assinatura RSA/SHA-256 da chave privada do mesmo A1; a chave privada nunca sai do PC;
- o coordenador remoto recebe apenas a credencial opaca por HTTPS e usa somente SHA-256 dela para selecionar o estado;
- PCs com o mesmo A1 RSA compartilham atomicamente o teto de 20 tentativas por hora;
- 429/`cStat 656` propagam cooldown compartilhado;
- indisponibilidade da coordenação bloqueia a chamada direta e direciona ao Portal;
- a implementação não reintroduz Central, pareamento, mDNS, pasta compartilhada ou certificado remoto.

Limitação consciente: dois certificados diferentes pertencentes ao mesmo CNPJ não compartilham a mesma identidade remota. Resolver isso sem enviar/registrar identidade fiscal no serviço remoto exigiria uma camada adicional de vínculo. O uso previsto do projeto é compartilhar o mesmo A1 entre os PCs que precisam da mesma janela.

Detalhes: `docs/architecture/fiscal-usage-guard.md`.

## Dependências externas ao código

Ainda exigem ação fora do repositório:

- **Authenticode real:** fornecer/configurar certificado de code signing e secrets do ambiente de release;
- **proteção administrativa da `main`:** habilitar ruleset/branch protection e checks obrigatórios com permissão administrativa;
- **aceitação física A4:** imprimir o checklist em Windows/impressora real.

Esses itens não devem ser simulados no código.

## Critério da próxima release

Nova release somente quando:

- CI inteiro estiver verde no mesmo SHA;
- regressões alfanuméricas passarem;
- coordenação fiscal compartilhada passar nos testes e no `wrangler deploy --dry-run`;
- DANFE A4 passar em teste automatizado e físico;
- consulta SEFAZ, Portal, lote, XML e atualização não regredirem;
- documentação estiver alinhada ao comportamento publicado.

Após a aceitação física, alinhar `Directory.Build.props`, notas e artifacts e publicar a próxima versão.
