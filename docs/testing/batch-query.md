# Aceitação física — consulta em lote

Este roteiro valida a consulta em lote incluída na release v0.0.13 e o comportamento atual da `main`, que remove o teto rígido de 10 chaves. Ele complementa `docs/testing/acceptance.md` e `docs/testing/portal-post-hcaptcha.md`.

## Pré-condições

- App/Bridge em execução no mesmo PC do navegador;
- certificado A1 válido selecionado;
- WebView2 Runtime disponível para cenários de Portal;
- usar NF-e reais cuja consulta seja autorizada pelo certificado;
- começar com lote pequeno de 2 a 5 chaves;
- não provocar `656` deliberadamente repetindo consultas.

## Entrada e lista

1. Abrir a tela principal e selecionar **Lote**.
2. Colar duas ou mais chaves válidas, uma por linha.
3. Confirmar que todas aparecem imediatamente na lista abaixo do campo e na mesma ordem.
4. Confirmar que **Visualizar DANFE** e **Baixar XML** começam desabilitados.
5. Repetir uma chave e confirmar que a duplicada é contabilizada e não vira uma segunda linha.
6. Inserir uma chave inválida e confirmar a contagem de inválidas.
7. Colar mais de 10 chaves válidas e confirmar que todas continuam aceitas, aparecem na lista e **Iniciar lote** permanece disponível.

## Processamento normal pela SEFAZ

1. Iniciar um lote pequeno válido.
2. Confirmar que apenas uma linha fica em consulta por vez.
3. Para cada sucesso:
   - a linha muda para **Concluída**;
   - a origem mostra **SEFAZ**;
   - número/série, emitente e valor aparecem quando existentes no XML;
   - **Visualizar DANFE** e **Baixar XML** ficam disponíveis imediatamente.
4. Abrir o DANFE de duas linhas diferentes e confirmar que cada modal corresponde à NF-e correta.
5. Baixar o XML de duas linhas e confirmar que cada arquivo pertence à chave da própria linha.

## Lote grande sem teto artificial

1. Montar um lote com quantidade superior a 10 chaves válidas.
2. Confirmar que nenhuma chave válida é descartada por quantidade.
3. Confirmar que o processamento continua estritamente sequencial.
4. Se a proteção fiscal local for ativada durante uso real, confirmar que o restante segue pelo Portal sem nova tentativa direta à SEFAZ.
5. Confirmar que o hCaptcha continua manual para cada operação Portal.

A ausência de limite rígido de itens não deve ser interpretada como garantia de capacidade ilimitada do Portal Nacional. O objetivo é remover o teto artificial da interface mantendo serialização, proteção fiscal e interação humana do hCaptcha.

## ZIP e impressão conjunta

Depois de pelo menos duas NF-e concluídas:

1. usar **Baixar XMLs (.zip)**;
2. abrir o ZIP e confirmar que contém somente XMLs concluídos, um por chave;
3. usar **Imprimir DANFEs**;
4. confirmar que somente DANFEs concluídos entram na impressão/PDF e que cada DANFE começa em página própria;
5. confirmar que as regras visuais atuais do DANFE continuam preservadas.

## Cancelamento

1. Iniciar um lote com mais de uma chave.
2. Cancelar enquanto uma operação estiver em andamento.
3. Confirmar que nenhuma nova linha começa depois do cancelamento.
4. Confirmar que itens ainda não iniciados ficam cancelados.
5. Confirmar que NF-e já concluídas continuam permitindo **Visualizar DANFE** e **Baixar XML**.

## Fallback `217`

Validar somente se ocorrer naturalmente em uma chave real:

1. a linha deve mudar para o Portal sem repetir a consulta direta;
2. resolver o hCaptcha manualmente;
3. confirmar que o XML validado retorna para a mesma linha;
4. confirmar origem **Portal**;
5. a próxima NF-e volta à rota SEFAZ se não houver proteção fiscal ativa.

## Limite fiscal / proteção local

Não force `656` para teste. Se o Bridge já estiver naturalmente em proteção, ou se o limite ocorrer durante uso real:

1. confirmar que a interface informa rota Portal;
2. confirmar que a NF-e atual segue pelo Portal;
3. resolver cada hCaptcha manualmente;
4. confirmar que as NF-e restantes seguem uma por vez pelo Portal;
5. confirmar que nenhuma nova chamada direta é feita à SEFAZ enquanto a proteção estiver ativa;
6. reiniciar o Bridge e confirmar que a proteção continua válida até o prazo salvo;
7. após o prazo expirar, confirmar que uma nova consulta pode voltar à SEFAZ.

## Falha do Portal

1. Em um cenário que esteja usando Portal, fechar/cancelar a janela antes da conclusão.
2. Confirmar que a linha não entra em retry automático.
3. Confirmar que aparece **Tentar pelo Portal**.
4. Usar a ação manual e confirmar que apenas aquela NF-e é reaberta.

## Regressão da consulta única

Depois dos testes do lote:

1. voltar para **Uma NF-e**;
2. consultar uma chave válida;
3. confirmar DANFE, download XML e fallback existentes;
4. confirmar que o certificado selecionado continua o mesmo;
5. confirmar que a tela de Configurações/Diagnóstico continua funcionando.

## Critério de aprovação física

A consulta em lote está fisicamente validada quando o fluxo normal, lote acima de 10 chaves, ações individuais, ZIP, impressão, cancelamento e regressão da consulta única passam em um PC real. Cenários `217` e limite fiscal devem ser registrados quando ocorrerem naturalmente, sem gerar consumo indevido apenas para testar.
