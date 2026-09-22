# Hardening da extensão Chromium — plano pós-pesquisa FSist

**Data:** 2026-09-22  
**Base:** `main` em `b7b6805753861e36700b308da8d4ed9a00921cfd` (v0.0.23 / extensão 0.2.1)  
**Objetivo:** tornar o fluxo site → extensão → Portal Nacional confiável em Chrome/Edge reais antes de qualquer remoção do Bridge/WebView2.

## Status de execução

- **Fase 1 — compatibilidade e diagnóstico:** implementada no código desta branch;
- **Fase 2 — conexão/lifecycle:** implementada no código do HEAD: `bridge_ready`, `focus`, `pageshow`, visibilidade, retry limitado do handshake do Portal, reconciliação da operação em `storage.session`, limpeza de estado obsoleto e start idempotente após resposta perdida; validação física ainda pendente;
- **Fase 3 — Portal real:** iniciada com erros diferenciados para popup/aba/navegação/operação perdida e detecção de fechamento de aba; captura real Chrome/Edge + A1 + hCaptcha + XML ainda depende do gate físico;
- **Fase 4 — distribuição corporativa:** planejada, ainda não iniciada.

## Evidência externa usada

A pesquisa técnica confirmou publicamente apenas o modelo de produto do FSist: instalação de uma extensão Chromium, consulta pelo Portal/consulta pública da Fazenda e uso de certificado instalado no Windows. A implementação interna atual do FSist não está publicamente documentada de forma suficiente para ser tratada como referência de código.

Fontes primárias usadas no planejamento:

- https://www.fsist.com.br/extensao/
- https://www.fsist.com.br/
- https://www.fsist.com.br/ajuda/artigos/instalar-certificado-digital-a1/
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/how-to/distribute
- https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/extensioninstallforcelist

Não copiar código, protocolo ou permissões internas do FSist sem evidência pública/licença. O projeto deve manter permissões mínimas, hCaptcha manual e certificado fora da extensão.

## Fase 1 — compatibilidade e diagnóstico (P0)

### Entregas

- aceitar `supplier-rules.json` legado com nomes de propriedades case-insensitive, compatível com o Bridge .NET;
- rejeitar campos ambíguos, por exemplo `version` e `Version` simultaneamente;
- canonicalizar o objeto salvo para `version/suppliers/id/taxIds`;
- erros de importação com caminho JSON e causa;
- resumo de importação com número de fornecedores e identificadores;
- nenhuma configuração antiga é sobrescrita quando a importação falha;
- restringir `chrome.storage.local` a contextos confiáveis da extensão;
- testes de regressão para casing legado, ambiguidade, conflitos e armazenamento.

### Critério de saída

O mesmo arquivo que era aceito pelo Bridge importa sem edição manual na extensão e permanece local.

## Fase 2 — conexão e lifecycle MV3 (P1)

### Entregas

- content script anuncia `bridge_ready` ao inicializar;
- gate extension-only reage ao anúncio, `focus`, `pageshow` e retorno de visibilidade;
- manter retries limitados de handshake, sem polling infinito;
- estados/erros de conectividade diferenciados;
- reconciliação de operação ativa após cold start/reload do service worker;
- start idempotente para a mesma aba + chave quando a resposta inicial se perde;
- limpeza segura de operação obsoleta quando popup/aba/site desaparecem;
- consulta explícita de status para o frontend não aguardar indefinidamente uma operação perdida;
- retry limitado do handshake do content script do Portal;
- testes de instalação/reload da extensão com a página já aberta.

### Critério de saída

A página muda para “Extensão conectada” sem `Ctrl+F5` quando a extensão é instalada/recarregada depois da página.

## Fase 3 — Portal e operação real (P1/P2)

### Entregas

- distinguir erro de abertura, aba perdida, download não encontrado, resposta inválida e sessão perdida;
- reconciliar popup/aba/operação armazenada em `storage.session`;
- reduzir polling de DOM onde `MutationObserver` for mais determinístico;
- manter replay restrito ao endpoint oficial e sem URL arbitrária;
- manter validação de XML, chave, tamanho e bloqueio de DTD.

### Gate físico obrigatório

Chrome e Edge, Bridge parado/desinstalado:

1. extensão conectada;
2. popup do Portal;
3. chave preenchida;
4. hCaptcha manual;
5. certificado A1 pelo navegador/Windows;
6. XML oficial capturado;
7. XML validado e devolvido ao site;
8. DANFE correto;
9. segunda consulta consecutiva;
10. cancelamento ao fechar popup;
11. lote sequencial com pelo menos duas NF-e legítimas.

Nenhum dado fiscal real deve entrar em GitHub, logs ou fixtures.

## Fase 4 — distribuição corporativa (P2)

### Entregas

- identidade estável da extensão;
- definir canal de distribuição suportado para Chrome/Edge;
- preferir Chrome Web Store / Edge Add-ons para usuários normais;
- suportar instalação gerenciada por política quando necessário;
- avaliar `storage.managed` apenas se houver requisito real de TI;
- ZIP + “Carregar sem compactação” fica restrito a desenvolvimento/piloto.

### Critério de saída

PC corporativo instala e atualiza a extensão sem depender de Modo do desenvolvedor.

## Restrições permanentes

- sem bypass/solver de CAPTCHA;
- sem PFX/P12/senha/chave privada dentro da extensão;
- sem `<all_urls>`;
- sem `nativeMessaging`, `downloads`, `cookies` ou `webRequestBlocking` sem requisito comprovado;
- sem CNPJ/CPF real em código, documentação, testes ou logs;
- Bridge/WebView2 só será removido após o gate físico extension-only completo.

## Ordem de execução

1. Fase 1 completa;
2. base de conexão reativa da Fase 2;
3. CI completo;
4. release de teste;
5. validação física;
6. somente então avançar para remoção de legado ou distribuição corporativa.
