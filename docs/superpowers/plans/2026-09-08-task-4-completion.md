# Task 4 — Lookup NF-e bruto pelo Bridge — Concluída

Data: 08/09/2026

Referência: `docs/superpowers/plans/2026-09-08-nfe-agendamento-2-implementation.md`, Task 4.

## Checklist concluído

- [x] RED e implementação da validação da chave NF-e de 44 dígitos, incluindo dígito verificador.
- [x] RED e implementação das categorias normalizadas do `NfeLookupService`.
- [x] Garantia de no-retry para HTTP 429, `cStat 656` e falhas ambíguas de transporte.
- [x] Porte cirúrgico somente do protocolo/transporte SEFAZ necessário ao lookup, sem Central, fila, liderança, cooldown compartilhado ou cache do projeto antigo.
- [x] Transporte autenticado pelo A1 selecionado para `NFeDistribuicaoDFe`, com timeout, leitura limitada e XML defensivo.
- [x] `POST /api/v1/nfe/lookup` integrado ao host local e coberto por teste de integração sem rede fiscal real no CI.
- [x] Contrato TypeScript e `BridgeClient.lookupNfe()` integrados ao site, sempre apontando para `http://127.0.0.1:17345/api/v1`.
- [x] Revisão final de ownership do A1: certificado materializado como instância independente e descartado ao final de cada lookup.
- [x] Falha de identificação segura do CNPJ do A1 classificada como `certificate_error` antes da abertura do HTTP.
- [x] `cStat 138` sem XML completo preservado como `fiscal_status`; sucesso só ocorre quando há XML válido da chave solicitada.

## Contrato operacional fechado

O Bridge valida novamente a chave mesmo que o site já tenha validado. Em uma consulta, recupera o A1 selecionado, cria material de uso independente, extrai o CNPJ do certificado, monta `consChNFe`, executa uma única chamada fiscal e descarta o certificado ao final.

A resposta é normalizada nas categorias `success`, `fiscal_status`, `consumption_limit`, `certificate_error`, `transport_unavailable` e `technical_error`. XML é devolvido somente em `success`, sem alteração do conteúdo fiscal.

`cUFAutor` não é inferido da chave da NF-e. Quando não existe uma UF autora confiável, o campo opcional é omitido.

## Segurança e limites validados

- Bridge somente em loopback.
- Certificado/chave privada permanecem no Windows/Bridge.
- DTD proibido no parsing XML.
- Limite de 10 MiB para resposta/XML descompactado.
- `docZip` só é aceito quando contém `procNFe` cuja `infNFe/@Id` corresponde exatamente à chave solicitada.
- Nenhum retry automático após resultado ou falha ambígua.

## Evidência de verificação

Antes deste fechamento documental, o CI do commit `9233cb9d40378dcb57aee14ed03ee0ecf15af109` concluiu com sucesso nos dois jobs:

- **bridge:** 49 testes, build Release e bootstrap do contrato local;
- **web:** testes Vitest e build Vite/TypeScript.

A documentação não marca como concluídas as próximas etapas. Pipeline XML no navegador, Fernando Klein, DANFE e fallback Portal/WebView2 permanecem pendentes a partir da Task 5.
