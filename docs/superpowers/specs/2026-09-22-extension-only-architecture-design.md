# Arquitetura sem Bridge — Site + Extensão Chromium

**Data:** 2026-09-22  
**Status:** planejamento aprovado; implementação ainda não iniciada  
**Baseline:** `main` após a release pública v0.0.21

## Objetivo

Eliminar a dependência do Bridge/WinForms/WebView2 e deixar o produto no modelo:

```text
Site NFe Agendamento
  ↓
Extensão Chromium MV3
  ↓
Popup Chrome/Edge
  ↓
Portal Nacional da NF-e
  ↓
Certificado A1 instalado no Windows
```

O site continua responsável por interface, validação da chave, parser XML, DANFE, lote e downloads. A extensão é o único componente local do produto. O navegador/Windows é responsável pela autenticação TLS com o certificado A1.

## Decisão principal

A arquitetura sem Bridge **não mantém a consulta direta NFeDistribuicaoDFe**.

A consulta normal passa a usar diretamente o Portal Nacional para cada NF-e. Isso é uma simplificação deliberada para atingir o modelo site + extensão sem aplicativo local.

Consequências:

- `FiscalUsageGuard` deixa de participar do fluxo normal;
- coordenação Cloudflare de tentativas diretas deixa de ser necessária;
- seleção/listagem de certificados pelo site é removida;
- o site não exibe mais estado do Bridge;
- o helper WebView2 deixa de existir no produto novo;
- o hCaptcha continua manual;
- lote continua sequencial, uma NF-e por vez.

A remoção física de código/infra ocorre somente depois do gate físico da extensão sem Bridge.

## Certificado A1

A extensão **não** enumera, importa, exporta nem seleciona certificados do Windows.

No Chrome/Edge desktop não existe uma API comum de extensão para enumerar e operar os certificados cliente do Windows. As APIs `certificateProvider` e `enterprise.platformKeys` documentadas pelo Chrome são restritas a ChromeOS/política e não são base para este projeto.

O fluxo esperado é o mesmo princípio usado pela consulta pública do FSist:

1. A1 instalado no Windows;
2. navegador acessa o Portal;
3. quando o Portal solicita autenticação TLS por certificado cliente, o navegador apresenta/usa o certificado aplicável;
4. a extensão apenas automatiza a página e a entrega do XML ao site.

Não serão usados:

- Native Messaging;
- PFX/P12 dentro da extensão;
- senha de certificado no site;
- API empresarial de certificado;
- alteração de política do Windows/Chrome como requisito;
- upload do certificado para Cloudflare.

Se houver mais de um certificado elegível, a escolha fica a cargo do navegador/usuário. Política empresarial de auto-seleção pode existir em ambientes gerenciados, mas não é requisito do NFe Agendamento.

## Consulta unitária

Fluxo alvo:

```text
chave válida
  → site verifica extensão
  → extensão abre popup Portal
  → preenche chave
  → usuário resolve hCaptcha
  → extensão continua consulta
  → navegador usa A1 quando o Portal solicitar
  → extensão obtém XML oficial
  → XML volta ao site
  → parse/validação
  → regra de fornecedor
  → DANFE/download
```

Não existe tentativa anterior via SEFAZ direta.

Se a extensão não estiver instalada/conectada, a consulta não inicia e o site mostra instrução objetiva de instalação.

## Lote

O lote usa exclusivamente o Portal e permanece estritamente sequencial.

Para cada chave:

1. abrir/reutilizar uma operação Portal;
2. aguardar hCaptcha humano;
3. aguardar certificado/download/XML;
4. validar XML;
5. concluir item;
6. somente então avançar para a próxima chave.

Não abrir dois popups simultâneos.

Não automatizar captcha em lote.

## Obtenção do XML

A primeira implementação deve reutilizar o mecanismo seguro já criado na extensão v0.1.0:

- observar somente a requisição oficial de download com `webRequest`;
- host/path allowlisted;
- reconstruir somente GET/POST conhecidos;
- obter o XML na sessão do navegador;
- limitar a 10 MiB;
- rejeitar DTD;
- validar chave no XML antes do handoff;
- site valida novamente pelo parser canônico.

### Gate técnico obrigatório

Antes de remover Bridge/WebView2 do repositório, o seguinte deve funcionar em Windows real **com o Bridge desinstalado/parado**:

1. extensão detectada pelo site;
2. popup abre;
3. chave é preenchida;
4. hCaptcha manual;
5. navegador consegue usar o A1;
6. XML retorna ao site;
7. DANFE abre;
8. XML baixa;
9. segunda consulta funciona;
10. cancelamento funciona;
11. lote de pelo menos duas NF-e funciona de forma sequencial.

Se o retorno programático do XML falhar no navegador real, a migração para sem Bridge para nesse gate. Não ampliar permissões nem introduzir acesso nativo apenas para contornar o Portal.

## Estado/diagnóstico do site

Substituir:

- `Bridge conectado`;
- painel de certificado;
- versão do Bridge;
- status WebView2;
- botão de download do componente Windows.

Por:

- `Extensão conectada`;
- versão da extensão;
- navegador compatível;
- botão/ação de diagnóstico da extensão;
- instrução de instalação quando ausente.

O site deve continuar utilizável para leitura/documentação mesmo sem extensão, mas os botões de consulta ficam indisponíveis.

## Regras de fornecedor

O Bridge hoje faz a identificação primária por CNPJ/CPF usando configuração local privada. Isso precisa de substituto antes da remoção final.

### Solução

Mover somente a **identificação privada** para `chrome.storage.local` da extensão.

A extensão guarda localmente:

```json
{
  "version": 1,
  "suppliers": [
    { "id": "fernando-klein", "taxIds": ["..."] }
  ]
}
```

O site, depois de validar o XML, pede:

```ts
resolveSupplier(taxId: string): Promise<{ supplierId: string | null }>
```

A extensão normaliza o identificador, compara localmente e devolve apenas `supplierId`.

Regras:

- CNPJ/CPF real nunca entra no bundle público;
- nunca é enviado ao Worker/Cloudflare;
- nunca entra em logs;
- configuração inválida falha como `supplierId: null`;
- o fallback atual por `xNome` permanece durante a transição;
- a configuração local pode ser importada por arquivo JSON usando uma tela própria da extensão, processada localmente.

Não existe migração automática de `%LOCALAPPDATA%NfeAgendamentoBridgesupplier-rules.json`, porque a extensão não terá acesso ao sistema de arquivos sem ação explícita do usuário.

## Protocolo site ↔ extensão

Expandir o protocolo atual.

Comandos:

```ts
type ExtensionCommand =
  | { type: 'ping'; requestId: string }
  | { type: 'start'; requestId: string; accessKey: string }
  | { type: 'cancel'; requestId: string; operationId: string }
  | { type: 'resolve_supplier'; requestId: string; taxId: string };
```

Handshake:

```ts
type ExtensionReady = {
  type: 'ready';
  requestId: string;
  version: string;
  capabilities: {
    portalLookup: true;
    supplierResolution: true;
  };
};
```

Nenhum comando de uso genérico de URL, fetch, arquivo ou execução de script será exposto ao site.

## Segurança

Permissões alvo continuam mínimas:

- `scripting`;
- `storage`;
- `webRequest`.

Host permissions:

- domínio oficial do NFe Agendamento;
- `https://www.nfe.fazenda.gov.br/*`.

Proibido:

- `<all_urls>`;
- Native Messaging;
- `downloads` para leitura de arquivos;
- `webRequestBlocking`;
- automação/resolução de captcha;
- PFX/P12/PEM/chave privada em código/storage;
- envio de CNPJ/CPF de fornecedor para Cloudflare;
- logs com chave NF-e completa ou XML.

## Infra Cloudflare

Na primeira entrega funcional sem Bridge, manter temporariamente as rotas existentes de coordenação/update no Worker, porém sem chamadas do frontend novo.

Depois do gate físico e de uma release estável:

- remover rotas de atualização do componente Windows;
- remover metadata/proxy do Setup;
- remover coordenação fiscal/Durable Object se não houver outro consumidor;
- remover bindings e documentação correspondente.

Isso separa a mudança de UX/fiscal da limpeza de infraestrutura e facilita rollback.

## Remoção do Bridge

A remoção final, após o gate físico, inclui:

- imports e clientes `apps/web/src/bridge/*` sem uso;
- certificate controller;
- UI de certificado/Bridge;
- `PortalFallbackController` e `PortalRouter` híbrido;
- projetos .NET Bridge/Portal;
- instalador Inno Setup;
- jobs `bridge`, `fiscal-compatibility` se exclusivamente ligados ao fluxo removido e `windows-package`;
- assets Windows na release;
- atualização do componente Windows;
- documentação de WebView2/lifecycle Windows como histórica;
- rotas Cloudflare obsoletas em mudança separada.

Histórico de releases e documentos históricos não é apagado.

## Distribuição

Enquanto a extensão não estiver na Chrome Web Store:

- GitHub Release publica ZIP da extensão;
- usuário extrai;
- `chrome://extensions` ou `edge://extensions`;
- Modo do desenvolvedor;
- Carregar sem compactação.

Após validação:

- avaliar publicação na Chrome Web Store/Edge Add-ons para atualização automática.

A publicação em loja não é requisito para remover o Bridge do código.

## Rollback

Durante a implementação:

- v0.0.21 permanece release estável de rollback;
- nova arquitetura é desenvolvida em branch própria;
- não remover Bridge antes do gate físico;
- se o gate falhar, abandonar/ajustar a branch sem afetar v0.0.21.

Após uma release extension-only, rollback operacional é reinstalar a release v0.0.21 e o Bridge v0.0.21.

## Critérios de conclusão

A migração está concluída quando:

1. o site não chama `127.0.0.1:17345`;
2. não existe mensagem `Bridge não conectado`;
3. consulta unitária funciona somente com site + extensão + A1 instalado;
4. lote funciona sequencialmente;
5. regras de fornecedor continuam funcionando sem expor CNPJ/CPF;
6. ausência da extensão é diagnosticada corretamente;
7. nenhum projeto Windows é necessário para uso normal;
8. CI não depende de .NET/Inno Setup para o produto novo;
9. release publica site/metadata relevante + extensão, sem Setup Windows;
10. documentação vigente não instrui instalar Bridge;
11. gate físico Chrome e Edge foi registrado como executado.

## Referências técnicas verificadas em 22/09/2026

- Chrome Extensions `webRequest`: disponível em Manifest V3 para observação; `webRequestBlocking` continua restrito na maioria das extensões.
- Chrome `certificateProvider`: ChromeOS only.
- Chrome `enterprise.platformKeys`: ChromeOS/policy; não é solução para Windows desktop comum.
- FSist informa publicamente que usa extensão do Chrome para consulta pública da Fazenda e exige A1 instalado no Windows quando certificado é necessário.
