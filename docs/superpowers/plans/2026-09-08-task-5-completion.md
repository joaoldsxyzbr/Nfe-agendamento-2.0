# Task 5 — Fechamento do pipeline XML no site

Data: 08/09/2026

## Escopo concluído

- validação da chave NF-e de 44 dígitos no navegador, incluindo dígito verificador;
- parser DOM do XML NF-e no site;
- rejeição de XML malformado, sem `infNFe` ou cuja `infNFe/@Id` não corresponda à chave consultada;
- preservação integral do XML original;
- extração tipada dos dados necessários às próximas etapas de apresentação: emitente, destinatário, itens, totais, datas e protocolo;
- integração do formulário com `BridgeClient.lookupNfe()`;
- nenhuma chamada ao Bridge quando a chave falha na validação local;
- download do XML disponibilizado somente após o XML retornado pelo Bridge passar pela validação local;
- mensagens de resposta renderizadas via DOM/texto, sem injeção de HTML fiscal/remoto.

## Evidência TDD

- RED da chave: 5 testes novos falharam porque `src/nfe/access-key.ts` ainda não existia.
- GREEN da chave: testes e build web passaram após a implementação.
- RED do XML: 4 testes novos falharam porque `src/nfe/xml.ts` ainda não existia, enquanto os testes anteriores permaneceram verdes.
- GREEN do parser: 19/19 testes web + build e Bridge completo verdes.
- RED da integração: 19 testes existentes verdes e apenas o novo contrato do fluxo no `main.ts` falhou.
- GREEN da integração: 20/20 testes web + build; 49/49 testes Bridge + build Release.

## Dependência XML

O site usa `@xmldom/xmldom` `0.9.12` para que o mesmo parser DOM seja exercitado nos testes Node e entregue no bundle do navegador.

## Estado após a Task 5

Task 5 concluída. Próxima etapa canônica: Task 6 — portar a regra de apresentação Fernando Klein acompanhada pelos testes de regressão do projeto anterior. DANFE e fallback Portal/WebView2 permanecem pendentes.
