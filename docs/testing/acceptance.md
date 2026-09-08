# Aceitação física — NFe Agendamento 2.0

Este checklist cobre o que o CI não consegue provar: navegador real falando com loopback, certificado A1 do Windows, SEFAZ, WebView2, Portal Nacional, captcha e impressão/PDF.

> Não provoque bloqueio/656 fazendo consultas repetidas. Valide o fallback quando o limite ocorrer naturalmente ou em um cenário controlado já disponível.

## Pré-requisitos

- Windows 10/11 atualizado;
- Bridge e `NfeAgendamento.Portal.exe` da mesma versão;
- Microsoft Edge WebView2 Runtime instalado;
- .NET 10 Desktop Runtime quando a distribuição usada não for self-contained;
- certificado A1 válido instalado em `CurrentUser/My` com chave privada;
- origem HTTPS exata do site configurada em `Bridge:AllowedOrigins`;
- acesso à Internet para SEFAZ e Portal Nacional da NF-e.

Registre antes de começar:

| Campo | Valor |
| --- | --- |
| Data | |
| Commit/versão | |
| URL do site | |
| Windows | |
| Navegador + versão | |
| PC | |

## 1. Bridge e permissão de rede local

Executar separadamente em **Chrome, Edge e Firefox** quando disponíveis.

1. Inicie o Bridge.
2. Abra o site HTTPS oficial.
3. Se o navegador pedir acesso à rede/local host, autorize.
4. Confirme `Bridge conectado`.
5. Negue/revogque a permissão uma vez e confirme o estado `Permissão de acesso local necessária` quando o navegador expuser essa distinção.
6. Feche o Bridge e confirme `Bridge não encontrado`.
7. Reinicie o Bridge.

Resultado:

| Navegador | Conectou | Permissão local tratada | Bridge ausente tratado | Observações |
| --- | --- | --- | --- | --- |
| Chrome | ☐ | ☐ | ☐ | |
| Edge | ☐ | ☐ | ☐ | |
| Firefox | ☐ | ☐ | ☐ | |

## 2. Certificado A1

1. Confirme que o site lista somente certificados utilizáveis.
2. Selecione o A1 correto.
3. Recarregue a página.
4. Confirme que a seleção permanece pelo thumbprint.
5. Confirme que nenhum PFX, senha ou chave privada aparece em respostas de rede do site.
6. Se houver um certificado vencido no PC de teste, confirme que ele não é oferecido como utilizável.

Resultado: ☐ aprovado

## 3. Validação da chave

1. Informe menos de 44 dígitos: deve mostrar `Chave inválida` e não consultar o Bridge fiscal.
2. Informe caracteres não numéricos: deve rejeitar.
3. Informe chave com DV incorreto: deve rejeitar.
4. Informe uma chave válida conhecida.

Resultado: ☐ aprovado

## 4. Consulta SEFAZ normal

Com uma NF-e conhecida e autorizada para o certificado:

1. Clique em `Consultar` uma única vez.
2. Confirme o retorno do XML sem retry perceptível.
3. Confirme número, série e emitente apresentados.
4. Baixe o XML e compare a chave `infNFe/@Id` com a chave consultada.
5. Confirme que o XML original não foi alterado pelo tratamento Fernando Klein.

Resultado: ☐ aprovado

## 5. DANFE

1. Clique em `Visualizar DANFE`.
2. Confira emitente, destinatário, chave, protocolo, itens, totais e informações adicionais contra o XML.
3. Para nota Fernando Klein, confira o código interno somente na apresentação e preserve `cProd` no XML.
4. Verifique a coluna inicial `Item` e a contagem/ordem.
5. Use `Ctrl + scroll`: somente o DANFE deve receber zoom.
6. Feche por botão, `Esc` e backdrop.
7. Use `Imprimir / PDF` e confira aproveitamento A4/paginação.
8. Confirme que transporte/volumes não aparece quando não há conteúdo útil.

Resultado: ☐ aprovado

## 6. Estados fiscais e indisponibilidade

Quando houver casos reais/controlados, confirme:

- `Resultado fiscal` para retorno sem XML;
- `SEFAZ indisponível` para indisponibilidade de transporte;
- `Certificado A1 indisponível` quando não houver A1 selecionado/utilizável;
- `XML inválido` quando um XML não puder ser validado contra a chave.

Resultado: ☐ aprovado

## 7. Fallback 656 / Portal

Execute apenas quando o limite de consumo ocorrer naturalmente ou houver cenário de teste controlado.

1. A resposta `consumption_limit` deve iniciar o fallback sem repetir `NFeDistribuicaoDFe`.
2. Confirme que abre uma janela separada do Portal Nacional.
3. Confirme que a chave foi apenas pré-preenchida.
4. Resolva o **hCaptcha manualmente**.
5. Faça a consulta no Portal.
6. Quando o Portal pedir certificado, confirme o mesmo A1 selecionado no site.
7. Baixe o XML pelo fluxo oficial.
8. A janela deve devolver o XML ao Bridge e o site deve apresentar a NF-e usando o mesmo parser/DANFE do fluxo normal.
9. Confirme que o XML baixado pelo Portal corresponde à chave pedida.
10. Repita fechando a janela antes do fim e confirme `Consulta pelo Portal cancelada`.

Resultado: ☐ aprovado

## 8. Bloqueios do helper WebView2

Durante o teste do Portal:

- tentativa de navegação externa deve ser bloqueada;
- nova janela externa deve ser bloqueada;
- download que não seja o endpoint XML oficial deve ser bloqueado;
- não deve existir automação de captcha.

Resultado: ☐ aprovado

## 9. Segundo PC independente

Em outro PC:

1. instale/inicie outra cópia do Bridge;
2. configure a mesma origem HTTPS permitida;
3. use o A1 instalado **nesse segundo PC**;
4. abra o mesmo site;
5. faça uma consulta normal.

Confirme que não há Central, pareamento, pasta compartilhada ou dependência do primeiro PC.

Resultado: ☐ aprovado

## Critério de aceite

Uma versão só deve ser marcada como pronta para uso real depois de:

- CI do commit final totalmente verde;
- build/pacote Windows correspondente identificado;
- etapas 1–5 aprovadas;
- etapa 7 aprovada em uma ocorrência real/controlada de limite antes de declarar o fallback Portal validado fisicamente;
- qualquer divergência registrada e corrigida antes da release.
