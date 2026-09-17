# Identificação local de fornecedores por CNPJ/CPF

## Objetivo

Tornar a identificação de fornecedores específicos mais precisa sem alterar o XML fiscal, sem enviar novos dados fiscais ao Cloudflare e sem expor CNPJ/CPF de fornecedores no bundle público do frontend.

As regras especiais existentes continuam sendo apenas de apresentação operacional no DANFE:

- Souza Cruz: conversão de quantidade interna para facilitar leitura em unidades;
- Fernando Klein: mapeamento de códigos internos de produtos;
- Dionisio: mapeamento de códigos internos de produtos.

## Estado atual

Hoje o frontend identifica fornecedores por `xNome` normalizado em `apps/web/src/nfe/supplier-rules.ts`. A correspondência é exata e existe para evitar aplicar transformação operacional em empresas com nomes parecidos.

O parser de XML já lê `CNPJ` ou `CPF` do emitente em `issuer.taxId`, então não é necessário mudar a leitura fiscal do XML.

O Bridge já roda localmente em `127.0.0.1`, usa `%LocalAppData%\NfeAgendamentoBridge` para estado local e protege suas rotas com as validações atuais de Host/Origin. Nenhum dado novo desta funcionalidade deve ser enviado ao Worker/Cloudflare.

## Decisão de arquitetura

A identificação primária do fornecedor passará a ser resolvida pelo Bridge local usando CNPJ/CPF do emitente.

Fluxo:

1. o frontend conclui o parse do XML normalmente;
2. usa `issuer.taxId` já extraído do XML;
3. envia somente esse identificador fiscal ao Bridge local;
4. o Bridge normaliza o valor e consulta uma configuração local;
5. o Bridge devolve apenas o identificador lógico da regra, por exemplo `souza-cruz`, `fernando-klein`, `dionisio` ou `null`;
6. o frontend aplica a regra de apresentação já existente;
7. durante a migração, quando o Bridge devolver `null`, o frontend ainda tenta o reconhecimento atual por `xNome`.

O XML original permanece intacto e continua sendo a fonte fiscal exibida no DANFE.

## Configuração local

A configuração deve ficar somente na máquina em:

`%LocalAppData%\NfeAgendamentoBridge\supplier-rules.json`

Estrutura sugerida:

```json
{
  "version": 1,
  "suppliers": [
    {
      "id": "souza-cruz",
      "taxIds": ["CNPJ_OU_CPF"]
    },
    {
      "id": "fernando-klein",
      "taxIds": ["CNPJ_OU_CPF"]
    },
    {
      "id": "dionisio",
      "taxIds": ["CNPJ_OU_CPF"]
    }
  ]
}
```

Um mesmo fornecedor pode possuir mais de um CNPJ/CPF cadastrado sem criar nova regra de apresentação.

O arquivo não deve:

- ser versionado no GitHub;
- ser enviado ao Cloudflare;
- ser empacotado no frontend público;
- aparecer em logs;
- ser sobrescrito durante atualização normal do Bridge.

## Normalização

A normalização do identificador fiscal deve:

- remover espaços e pontuação de formatação;
- preservar letras;
- normalizar letras para um único casing;
- rejeitar valores vazios ou claramente inválidos;
- não assumir que CNPJ contém somente dígitos, preservando compatibilidade com CNPJ alfanumérico.

Não será usado hash simples nem HMAC no frontend. Hash simples não oferece benefício real para um espaço de identificadores enumerável e HMAC exigiria segredo fora do navegador, adicionando complexidade sem necessidade para este caso local.

## Endpoint local

Adicionar uma operação pequena no Bridge para resolver o fornecedor a partir do identificador fiscal. A resposta deve conter somente o resultado lógico, por exemplo:

```json
{
  "supplierId": "souza-cruz"
}
```

ou:

```json
{
  "supplierId": null
}
```

O endpoint deve reutilizar as proteções locais atuais de Host/Origin e nunca registrar o valor recebido.

## Comportamento de fallback

Durante a migração:

- documento encontrado no Bridge: usar o `supplierId` retornado;
- documento não encontrado: tentar a regra atual por `xNome`;
- arquivo ausente, vazio ou inválido: resolver como `null` e usar fallback por nome;
- Bridge indisponível: não bloquear o processamento do XML nem o DANFE; apenas deixar de aplicar identificação por documento e usar o comportamento compatível definido no frontend.

Depois que os CNPJs/CPFs reais de Fernando Klein, Dionisio e Souza Cruz forem cadastrados e validados em NFs reais, o fallback por `xNome` poderá ser removido em uma mudança posterior separada.

## Regras de apresentação

A mudança de identidade do fornecedor não altera as regras funcionais existentes.

A regra Souza Cruz continua responsável somente pela conversão operacional de quantidade.

Fernando Klein e Dionisio continuam reutilizando o catálogo de mapeamento de códigos internos.

O valor fiscal original, `cProd`, quantidades originais e demais campos do XML continuam preservados.

## Simplificação de nomenclatura

Na mesma mudança, nomes internos que hoje mencionam especificamente Fernando Klein, mas já atendem também Dionisio, devem ser generalizados sem criar nova camada arquitetural.

Exemplo de direção:

- `resolveFernandoKleinProduct` -> `resolveSupplierProduct`;
- tipos auxiliares equivalentes devem receber nomes neutros quando realmente compartilhados;
- manter a quantidade de arquivos atual sempre que possível;
- não criar novos frameworks, stores, serviços remotos ou abstrações genéricas desnecessárias.

Essa renomeação deve ser puramente estrutural e não alterar o resultado do DANFE.

## Erros e fail-safe

Falhas nessa funcionalidade não devem impedir consulta, download ou visualização da NF-e.

O comportamento deve ser conservador:

- configuração inválida -> `supplierId: null`;
- fornecedor desconhecido -> `supplierId: null`;
- erro de leitura local -> `supplierId: null`;
- nenhuma transformação especial deve ser aplicada por engano.

Nenhuma falha nessa resolução pode gerar retry fiscal, nova consulta à SEFAZ ou mudança no fluxo de Portal.

## Testes

A implementação deverá ser guiada por testes e cobrir pelo menos:

- resolução por CNPJ;
- resolução por CPF;
- CNPJ alfanumérico;
- valores com pontuação e espaços;
- múltiplos identificadores para um mesmo fornecedor;
- identificador desconhecido;
- arquivo ausente;
- JSON inválido;
- garantia de que o identificador recebido não é registrado em logs;
- resposta contendo apenas `supplierId`;
- fallback por `xNome` durante a migração;
- Souza Cruz mantendo a mesma conversão atual;
- Fernando Klein e Dionisio mantendo os mesmos códigos internos atuais;
- nenhum impacto no XML fiscal original;
- nenhuma regressão no DANFE e nos testes existentes.

## Documentação

A implementação deverá atualizar `docs/architecture/supplier-rules.md` para refletir:

- identificação primária local por CNPJ/CPF;
- localização do arquivo de configuração;
- formato e manutenção da configuração;
- fallback temporário por `xNome`;
- política de não enviar identificadores fiscais ao Cloudflare;
- procedimento para adicionar ou alterar um fornecedor.

A documentação deve deixar explícito que os CNPJs/CPFs reais não pertencem ao repositório público.

## Fora de escopo

Esta mudança não inclui:

- banco de dados;
- Cloudflare D1;
- Worker novo;
- upload de CNPJ/CPF para Cloudflare;
- criptografia/HMAC de identificadores no frontend;
- alteração de regras fiscais;
- alteração de consulta SEFAZ;
- alteração de Portal fallback;
- mudança visual ampla do DANFE;
- remoção imediata do fallback por nome antes da validação real dos três fornecedores.

## Critérios de aceite

A mudança estará pronta quando:

1. o Bridge resolver corretamente os fornecedores cadastrados usando CNPJ/CPF local;
2. o frontend nunca precisar conhecer os CNPJs/CPFs cadastrados no Bridge;
3. nenhum identificador novo for enviado ao Cloudflare;
4. o fallback por `xNome` continuar funcionando durante a migração;
5. Souza Cruz, Fernando Klein e Dionisio produzirem exatamente o mesmo resultado operacional atual no DANFE;
6. a configuração sobreviver às atualizações do Bridge;
7. todos os testes relevantes passarem;
8. a documentação estiver atualizada no mesmo conjunto de mudanças.
