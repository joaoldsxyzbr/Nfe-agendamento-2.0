# Aceitação física — consulta unificada

Este roteiro valida a interface unificada de consulta da `main`. O mesmo campo aceita uma ou várias chaves e o processamento continua reutilizando o fluxo sequencial já usado pela consulta em lote. Ele complementa `docs/testing/acceptance.md` e `docs/testing/portal-post-hcaptcha.md`.

## Pré-condições

- App/Bridge em execução no mesmo PC do navegador;
- certificado A1 válido selecionado;
- WebView2 Runtime disponível para cenários de Portal;
- usar NF-e reais cuja consulta seja autorizada pelo certificado;
- começar com 1 a 5 chaves;
- não provocar `656` deliberadamente repetindo consultas.

## Interface unificada

1. Abrir a tela principal.
2. Confirmar que não existe mais a alternância **Uma NF-e | Lote**.
3. Confirmar que o botão principal se chama **Consultar** e fica alinhado à esquerda.
4. Sem consulta concluída e com zero ou uma chave válida, confirmar que **Nova consulta** não aparece.
5. Colar uma chave válida e confirmar que uma única linha aparece abaixo.
6. Confirmar que a tela entra em modo compacto: campo baixo, espaçamento reduzido e ações coletivas **Baixar XMLs (.zip)** / **Imprimir DANFEs** ocultas.
7. Confirmar que, em resolução desktop normal, o fluxo de uma NF-e fica visível sem necessidade de rolagem excessiva.
8. Concluir uma tentativa de consulta com uma chave e confirmar que **Consultar** é substituído por **Nova consulta** exatamente no mesmo lugar.
9. Usar **Nova consulta** e confirmar que entrada e lista são limpas, o foco volta ao campo e **Consultar** reaparece.
10. Colar duas ou mais chaves válidas, uma por linha.
11. Confirmar que o campo volta automaticamente ao layout expandido, as ações coletivas reaparecem e **Consultar** / **Nova consulta** ficam lado a lado.
12. Confirmar que todas aparecem imediatamente na lista abaixo do campo e na mesma ordem.
13. Confirmar que **Visualizar DANFE** e **Baixar XML** começam desabilitados.
14. Repetir uma chave e confirmar que a duplicada é contabilizada e não vira uma segunda linha.
15. Inserir uma chave inválida e confirmar a contagem de inválidas.
16. Colar mais de 10 chaves válidas e confirmar que todas continuam aceitas e **Consultar** permanece disponível.

## Tipografia

1. Em Windows 11, confirmar que a interface usa a família visual moderna do sistema (**Segoe UI Variable**) sem depender de download externo de fonte.
2. Confirmar que títulos possuem leitura mais destacada que textos auxiliares, sem perda de legibilidade.
3. Confirmar que chaves NF-e permanecem monoespaçadas, preferencialmente com **Cascadia Mono/Cascadia Code** quando disponíveis e fallback adequado em outros sistemas.
4. Confirmar que botões, campos e textos mantêm alinhamento e não sofrem corte após a troca tipográfica.

## Processamento de uma NF-e

1. Informar uma única chave válida.
2. Confirmar que somente **Consultar** está visível no bloco de ação principal.
3. Clicar em **Consultar**.
4. Confirmar que somente uma linha é processada e que o layout compacto permanece durante a consulta.
5. Durante o processamento, confirmar que **Consultar** permanece no mesmo lugar e fica indisponível.
6. Quando a tentativa terminar, com sucesso ou erro terminal, confirmar que **Consultar** desaparece e **Nova consulta** aparece no mesmo lugar.
7. Em caso de sucesso, confirmar que o resultado final fica ainda mais compacto: ordem, chave abreviada, badges de status/origem e barra de progresso deixam de ocupar espaço visual.
8. Confirmar que permanecem em destaque número/série da NF-e, emitente, valor e as ações **Visualizar DANFE** / **Baixar XML**.
9. Confirmar que o resultado e as ações cabem confortavelmente na tela junto com o formulário em resolução desktop normal.
10. Clicar em **Nova consulta** e confirmar que entrada/resultados são limpos, o foco retorna ao campo e **Consultar** reaparece.
11. Confirmar que fallback Portal e proteção fiscal continuam funcionando pelas mesmas regras quando ocorrerem naturalmente.

## Processamento de várias NF-e

1. Informar um conjunto pequeno de chaves válidas.
2. Clicar em **Consultar**.
3. Confirmar que apenas uma linha fica em consulta por vez.
4. Para cada sucesso:
   - a linha muda para **Concluída**;
   - a origem mostra **SEFAZ** ou **Portal**;
   - número/série, emitente e valor aparecem quando existentes no XML;
   - **Visualizar DANFE** e **Baixar XML** ficam disponíveis imediatamente.
5. Abrir o DANFE de duas linhas diferentes e confirmar que cada modal corresponde à NF-e correta.
6. Baixar o XML de duas linhas e confirmar que cada arquivo pertence à chave da própria linha.

## Volume acima de 10 chaves

1. Montar uma consulta com quantidade superior a 10 chaves válidas.
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

1. Iniciar uma consulta com mais de uma chave.
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

## Critério de aprovação física

A interface unificada está fisicamente validada quando consulta com uma chave em modo compacto, troca **Consultar → Nova consulta** no mesmo lugar, restauração/foco após **Nova consulta**, resultado unitário compacto, tipografia legível, consulta com várias chaves, expansão automática, volume acima de 10, ações individuais, ZIP, impressão e cancelamento passam em um PC real. Cenários `217` e limite fiscal devem ser registrados quando ocorrerem naturalmente, sem gerar consumo indevido apenas para testar.
