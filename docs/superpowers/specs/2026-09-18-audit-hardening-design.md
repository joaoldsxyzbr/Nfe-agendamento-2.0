# Hardening final pós-auditoria — design

Data: 2026-09-18

## Objetivo

Fechar os achados técnicos confirmados na auditoria da `main` sem alterar a arquitetura base do produto: site Cloudflare + App/Bridge por PC + helper Portal + coordenação fiscal via Worker/Durable Object.

## Escopo aprovado

A solicitação "ajuste tudo" aprova a correção dos achados listados na auditoria imediatamente anterior. O trabalho cobre código, testes, workflows e documentação.

**Decisão posterior aprovada em 18/09/2026:** Authenticode e ruleset/branch protection não são requisitos do projeto. O suporte opcional de assinatura pode permanecer no pipeline, mas sua ausência não bloqueia updater, CI ou release. A ausência de ruleset também não representa pendência. Esta decisão substitui qualquer requisito obrigatório desses dois controles descrito abaixo na versão inicial desta spec.

## Decisões

### 1. Consulta/lote e interface

- Preservar a mensagem real quando um lote falhar antes de processar itens; não sobrescrever por "Lote concluído".
- Garantir semanticamente que elementos com `hidden` não apareçam por regra CSS conflitante.
- Reintroduzir um teto operacional de lote para evitar crescimento ilimitado de memória no navegador.
- Reduzir cópia desnecessária na geração de ZIP: usar partes do `Blob` diretamente, em vez de montar um segundo buffer contínuo gigante.
- Manter consulta sequencial e proteção fiscal existentes.

Teto escolhido: **100 NF-e válidas por lote**. É suficientemente alto para o uso interno esperado e impede a entrada sem limite. O ZIP continua validando quantidade e passa a validar também tamanho agregado antes de produzir o arquivo.

### 2. Worker Cloudflare

#### Coordenação fiscal

O bearer atual é deliberadamente opaco e não carrega identidade fiscal para a nuvem. O Worker não tem material suficiente para provar que a credencial veio de um A1 sem aumentar a exposição de identidade. Portanto, o hardening será contra abuso/custo:

- limiter por IP de origem Cloudflare em vez de chave global constante;
- limite menor e compatível com o teto fiscal real;
- rota/método/bearer continuam validados antes de qualquer acesso protegido;
- Durable Object continua recebendo apenas o hash da credencial.

#### Atualizações

- adicionar rate limiter próprio para metadata/download;
- cachear metadata de `/api/update/latest` no Cache API por curto período;
- preservar validações de tag, nome, tamanho, digest e origem do asset;
- downloads permanecem restritos ao caminho oficial versionado.

### 3. Cadeia Windows

- Updater valida versão/origem esperada do asset, nome, tamanho e SHA-256 antes de executar o Setup.
- Authenticode permanece **opcional**: se os secrets estiverem configurados, o pipeline assina os artefatos; sem secrets, CI e release continuam normalmente.
- Não existe gate obrigatório de Authenticode no commit de release.
- O suporte opcional de assinatura não altera o fluxo funcional do updater.

### 4. Acessibilidade DANFE

O modal:
- guarda o elemento com foco antes de abrir;
- mantém Tab/Shift+Tab dentro do diálogo;
- devolve o foco ao elemento anterior ao fechar;
- preserva Esc/backdrop e lifecycle de zoom já existentes.

### 5. Portal e testes de interface

- limpar XMLs temporários do diretório dedicado quando tiverem mais de 24 horas, cobrindo a hipótese de crash abrupto;
- adicionar Playwright sobre a aplicação Vite real para validar o fluxo unitário, estados `hidden`, card estático, ações e reset; o mock substitui somente o Bridge loopback, não a UI.

### 6. Supply chain e governança

- pin de CodeQL por SHA imutável;
- manter GitHub Actions existentes já pinadas;
- registrar que ruleset/branch protection é opcional e não compõe o backlog do projeto.

### 7. Documentação

Sincronizar referências atuais da v0.0.16, novo teto de lote, rate limits/cache e a decisão de manter Authenticode/ruleset como controles opcionais.

## Testes

TDD para mudanças comportamentais:

- web: lote falha mantendo mensagem; limite de 100; `hidden`; ZIP sem buffer monolítico e com limite;
- Worker: limiter por IP, limiter de update, cache hit sem novo GitHub fetch;
- Bridge/App: updater exige tamanho e SHA-256 válidos sem depender de assinatura Authenticode;
- DANFE viewer: trap de foco e restauração;
- Portal: limpeza de XML temporário obsoleto;
- cobertura: provider V8 pinado no lockfile, medição de `src/**/*.ts` e `worker/**/*.ts` no CI;
- Playwright: fluxo real da tela principal com Bridge interceptado;
- workflows: CodeQL pinado; assinatura Authenticode opcional sem gate obrigatório de release.

Validação final exige CI completo verde no HEAD final.

## Fora do alcance executável neste ambiente

Testes físicos Windows/SEFAZ/A1/Portal/impressora continuam fora do CI. Authenticode e ruleset/branch protection são opcionais e, por decisão do projeto, não são pendências de conclusão.
