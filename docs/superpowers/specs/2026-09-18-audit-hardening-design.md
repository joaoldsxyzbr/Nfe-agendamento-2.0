# Hardening final pós-auditoria — design

Data: 2026-09-18

## Objetivo

Fechar os achados técnicos confirmados na auditoria da `main` sem alterar a arquitetura base do produto: site Cloudflare + App/Bridge por PC + helper Portal + coordenação fiscal via Worker/Durable Object.

## Escopo aprovado

A solicitação "ajuste tudo" aprova a correção dos achados listados na auditoria imediatamente anterior. O trabalho cobre código, testes, workflows e documentação. Controles que dependem de recursos externos não disponíveis pelo repositório — certificado Authenticode real e permissão administrativa para ruleset da `main` — devem ficar preparados e explicitamente bloqueados, sem serem declarados concluídos.

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

O CI comum pode continuar produzindo artefatos não assinados para validação. Entretanto, um **commit de release** não pode ficar verde sem Authenticode válido.

- CI de release commit valida assinatura dos três executáveis e do Setup.
- Sem secrets/certificado, release commit falha antes de publicação.
- Updater valida SHA-256 e, adicionalmente, Authenticode confiável antes de executar o Setup.
- O verificador usa a política Authenticode do Windows; nenhum instalador sem assinatura confiável é executado pelo updater.

O certificado real de code signing continua sendo um pré-requisito externo para publicar a próxima release.

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
- documentar que ruleset da `main` continua externo e obrigatório.
- a integração atual não possui administração para ativar ruleset; isso não será mascarado por workaround automático de revert.

### 7. Documentação

Sincronizar referências atuais da v0.0.16, novo teto de lote, rate limits/cache, assinatura obrigatória para release e estado real da proteção de `main`.

## Testes

TDD para mudanças comportamentais:

- web: lote falha mantendo mensagem; limite de 100; `hidden`; ZIP sem buffer monolítico e com limite;
- Worker: limiter por IP, limiter de update, cache hit sem novo GitHub fetch;
- Bridge/App: updater exige verificador de assinatura; falha de assinatura remove instalador e impede execução;
- DANFE viewer: trap de foco e restauração;
- Portal: limpeza de XML temporário obsoleto;
- cobertura: provider V8 pinado no lockfile, medição de `src/**/*.ts` e `worker/**/*.ts` no CI;
- Playwright: fluxo real da tela principal com Bridge interceptado;
- workflows: CodeQL pinado; release commit exige validação Authenticode.

Validação final exige CI completo verde no HEAD final.

## Fora do alcance executável neste ambiente

1. fornecer/comprar certificado Authenticode real;
2. gravar secrets reais de code signing no GitHub;
3. criar/ativar ruleset de `main` que exige permissão administrativa;
4. testes físicos Windows/SEFAZ/A1/Portal/impressora.

Esses itens permanecem externos, mas o repositório deve impedir que uma release seja publicada fingindo que a assinatura está pronta.
