# POC fiscal — Unimake.DFe

Data: 15/09/2026.

## Objetivo

Avaliar o `Unimake.DFe` como dependência fiscal auxiliar sem substituir de forma prematura a arquitetura atual do NFe Agendamento.

O pacote **não está no caminho de produção**. Ele é usado somente pelo projeto isolado `tests/unimake-poc/UnimakePoc.csproj`, executado pelo job `fiscal-compatibility` do CI.

## Versão avaliada

- pacote: `Unimake.DFe`;
- versão fixada: `20260908.1441.34`;
- target publicado: .NET Standard 2.0, compatível com o Bridge em .NET 10;
- repositório de origem: `Unimake/DFe`;
- licença do projeto: MIT.

A versão foi fixada de forma exata no POC. O restore habilita auditoria NuGet e trata avisos `NU1901` a `NU1904` como erro.

## O que o POC valida

O executável de compatibilidade compara o comportamento do nosso `AccessKey` com `Unimake.Business.DFe.Utility.XMLUtility` usando:

- chave NF-e numérica válida;
- chave NF-e com CNPJ alfanumérico válida;
- a mesma chave alfanumérica com DV inválido;
- reconhecimento explícito de CNPJ alfanumérico;
- cálculo do DV da chave alfanumérica de referência.

O POC também exige em tempo de compilação a presença dos tipos `Unimake.Business.DFe.Xml.NFe.IBSCBS` e `IBSCBSTot`, confirmando que a versão avaliada já expõe modelo para os grupos de RTC usados na próxima fase de estudo.

## Critério de adoção

A existência do POC **não autoriza** trocar nosso fluxo SEFAZ, parser ou DANFE. A adoção de código da biblioteca em produção só deve ocorrer quando houver paridade comprovada para o componente específico e regressões do projeto cobrindo o comportamento.

Ordem recomendada:

1. usar a biblioteca como oráculo adicional em testes fiscais;
2. comparar serialização/desserialização de XMLs atuais, inclusive CNPJ alfanumérico e IBS/CBS;
3. introduzir uma interface/adaptador próprio somente quando houver benefício claro;
4. migrar uma responsabilidade por vez;
5. manter Portal, UI, regras operacionais e renderer DANFE sob controle do projeto.

## Limites conhecidos

- o POC ainda não executa consulta real à SEFAZ;
- não usa certificado A1;
- não substitui validação contra schemas oficiais;
- não prova que todo o modelo IBS/CBS necessário ao nosso DANFE esteja mapeado corretamente;
- não remove a necessidade de fixtures oficiais/representativas da RTC.
