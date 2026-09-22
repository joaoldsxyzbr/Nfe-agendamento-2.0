# Aceitação física — NFe Agendamento direto-first

Este checklist cobre o que o CI não consegue provar no ambiente real.

## Pré-requisitos

- Windows 10/11;
- Chrome ou Edge compatível;
- extensão NFe Agendamento instalada/ativa;
- certificado A1 válido instalado no Windows;
- CNPJ do A1 configurado nas opções da extensão;
- site oficial `https://nfeagendamento.joaolds.xyz.br`.

Não é necessário Bridge, WebView2 helper, .NET ou Setup.

## 1. Diagnóstico

1. abrir o site;
2. confirmar **Extensão conectada**;
3. abrir configurações e confirmar **Consulta direta: Pronta**;
4. se aparecer **Configurar CNPJ**, clicar no ícone da extensão, informar o CNPJ do A1 e salvar;
5. desabilitar/reabilitar a extensão e confirmar recuperação.

## 2. Consulta direta

1. informar uma chave que a distribuição direta possa devolver;
2. confirmar **Consultando SEFAZ**;
3. confirmar que o Portal não abre quando a SEFAZ retorna XML;
4. confirmar XML e DANFE;
5. repetir uma segunda consulta.

Este teste é obrigatório em máquina real porque CI não valida a negociação TLS com A1 do Chrome/Edge.

## 3. Fallback Portal

Quando houver uma NF-e que produza `217` na consulta direta:

1. confirmar que só então o Portal abre;
2. resolver hCaptcha manualmente;
3. confirmar retorno do XML;
4. confirmar que a próxima NF-e tenta a SEFAZ novamente.

Para `656`/429/proteção, confirmar em ambiente seguro que o lote passa a usar Portal sem insistir na SEFAZ.

## 4. Lifecycle do Portal

1. iniciar um fallback e fechar o popup;
2. confirmar cancelamento explícito;
3. iniciar nova consulta e confirmar recuperação;
4. recarregar/fechar a página durante operação e confirmar que não fica estado preso.

## 5. Lote

1. informar pelo menos duas chaves;
2. confirmar processamento estritamente sequencial;
3. confirmar que sucesso direto não abre Portal;
4. confirmar `217` pontual sem mudar permanentemente a rota;
5. confirmar que proteção fiscal muda os itens restantes para Portal;
6. testar cancelamento;
7. validar ZIP/DANFE somente das concluídas.

## 6. Chrome e Edge

Repetir pelo menos uma consulta direta completa em Chrome e Edge.

## Critério de aceite

- CI/CodeQL do SHA final verdes;
- CNPJ fiscal configurado;
- consulta direta real aprovada;
- XML/DANFE aprovados;
- fallback Portal aprovado;
- lote sequencial aprovado;
- Chrome e Edge aprovados.

O hCaptcha deve permanecer exclusivamente manual.
