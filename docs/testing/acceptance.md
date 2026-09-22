# Aceitação física — NFe Agendamento extension-only

Este checklist cobre o que o CI não consegue provar no ambiente real.

## Pré-requisitos

- Windows 10/11;
- Chrome ou Edge compatível;
- extensão NFe Agendamento instalada/ativa;
- certificado A1 válido instalado no Windows quando exigido pelo Portal;
- site oficial `https://nfeagendamento.joaolds.xyz.br`;
- acesso ao Portal Nacional da NF-e.

Não é necessário instalar Bridge, WebView2 helper, .NET ou Setup do NFe Agendamento.

## 1. Diagnóstico

1. abrir o site;
2. confirmar **Extensão conectada** e versão;
3. desabilitar a extensão e confirmar **Extensão não conectada**;
4. reabilitar/recarregar e confirmar recuperação.

## 2. Consulta unitária

1. informar chave válida;
2. confirmar abertura de um único popup;
3. confirmar chave preenchida;
4. resolver o hCaptcha manualmente;
5. usar/selecionar o A1 quando Chrome/Edge solicitar;
6. confirmar retorno do XML;
7. confirmar chave do XML;
8. abrir DANFE;
9. baixar XML;
10. imprimir/PDF se necessário.

## 3. Repetição e lifecycle

1. concluir uma segunda consulta na mesma sessão;
2. iniciar uma consulta e fechar o popup;
3. confirmar cancelamento explícito;
4. iniciar nova consulta e confirmar recuperação;
5. recarregar/fechar a página durante uma operação e confirmar que não fica estado preso.

## 4. Lote

1. informar pelo menos duas chaves legítimas;
2. iniciar lote;
3. confirmar que nunca existem dois popups/operações Portal simultâneos;
4. concluir cada hCaptcha manualmente;
5. confirmar que a segunda NF-e só começa depois da primeira terminar;
6. validar XML/DANFE das concluídas;
7. testar cancelamento e confirmar que novos itens não iniciam.

## 5. Fornecedor local

Quando aplicável:

1. importar o JSON privado pelas opções da extensão;
2. confirmar que a regra visual correta é aplicada;
3. confirmar que o XML original não foi alterado;
4. confirmar que CNPJ/CPF privado não aparece em rede/logs do aplicativo.

## 6. Chrome e Edge

Repetir pelo menos uma consulta completa em Chrome e Edge.

## Critério de aceite

- CI/CodeQL do SHA final verdes;
- extensão detectada;
- consulta unitária aprovada;
- segunda consulta aprovada;
- cancelamento/recuperação aprovados;
- lote sequencial aprovado;
- XML/DANFE aprovados;
- Chrome e Edge aprovados.

O hCaptcha deve permanecer exclusivamente manual.
