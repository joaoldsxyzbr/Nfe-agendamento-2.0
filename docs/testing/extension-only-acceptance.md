# Aceite físico: NFe Agendamento somente extensão

Branch: nfe-agendamento | Manifest: 0.3.0 | **Status: NÃO EXECUTADO**.

Realizar no Windows com perfis separados do Chrome e Edge. Nunca registrar dados reais da NF-e, chave completa, XML, CNPJ/CPF ou certificado em evidências.

## Compilação e instalação

- [ ] npm ci, npm audit, lint, formatação, testes web/extensão, build e CI aprovados.
- [ ] ZIP/dir MV3 contém app.html, módulos JS, CSS, marca, opções, service worker, content script.
- [ ] Chrome instala sem erro e abre/foca janela popup centralizada (metade da largura de referência), sem criar uma nova aba.
- [ ] Edge instala sem erro e abre/foca janela popup centralizada (metade da largura de referência), sem criar uma nova aba.
- [ ] O segundo clique no ícone apenas foca o popup existente e mantém os dados preenchidos.
- [ ] Em tela menor ou janela do navegador não maximizada, o popup permanece utilizável e redimensionável.
- [ ] A interface funciona sem acesso ao domínio Cloudflare do site antigo.
- [ ] Configurações e regras privadas do fornecedor funcionam.
- [ ] Tema, acessibilidade, CSS, marca, navegação e diagnósticos corretos.

## Portal, documentos e confiabilidade

- [ ] Consulta unitária abre popup oficial e preenche chave.
- [ ] hCaptcha resolvido manualmente.
- [ ] Certificado digital permanece sob gestão do Chrome/Edge quando solicitado.
- [ ] XML oficial é recebido na aba da extensão e corresponde à chave.
- [ ] DANFE e impressão/PDF funcionam com notas curtas e longas.
- [ ] Downloads XML, ZIP, CSV funcionam.
- [ ] Segunda consulta funciona no mesmo navegador.
- [ ] Duas chaves em lote seguem em ordem, sem duas consultas simultâneas.
- [ ] Cancelar/fechar janela impede avançar no lote.
- [ ] Falha do Portal permite recuperação manual por XML validado.
- [ ] Fechar/reabrir popup ou reiniciar navegador não duplica operação e expõe erros.
- [ ] Fluxo não usa Workers Cloudflare, D1 nem outro backend próprio.

| Navegador | Status | Observações |
| --- | --- | --- |
| Chrome | NÃO EXECUTADO | Pendente |
| Edge | NÃO EXECUTADO | Pendente |

**Decisão:** não publicar release de produção, não mesclar na main e não desligar site existente sem evidência real acima.
## Evidência CI do piloto — 22/10/2026

Execução de referência: [GitHub Actions #1246](https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/actions/runs/39831571824), commit `ba2c1fd993489b5ed950990425054041df1de0f6`.

- **extension: SUCESSO** — testes da extensão e empacotamento MV3 passaram.
- **danfe-print: SUCESSO** — testes automatizados de impressão passaram.
- **security-audit: FALHA** — `npm audit --audit-level=high` retornou erro; a causa exata precisa ser conferida no log do job, sem ignorar a falha.
- **web: situação não confirmada** — o status individual reportado ainda constava em execução na última consulta, embora o workflow geral estivesse concluído com falha.
- **teste físico: NÃO EXECUTADO** — nenhuma NF-e real, certificado ou captcha foi testado neste piloto.

A checagem automática **Workers Builds** apareceu porque a integração Cloudflare existente ainda acompanha o repositório. Ela **não é dependência de execução do novo aplicativo**; esta alteração não autoriza desativar a produção atual. Não afirmar que sua existência comprova que o piloto foi publicado.

Próxima pendência: investigar/corrigir a auditoria de dependências, obter CI integralmente verde e executar o gate físico nos dois navegadores.