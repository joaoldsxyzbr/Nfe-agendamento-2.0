# Tela de consulta

## Cabeçalho

À esquerda: logo, nome e descrição. À direita: status da extensão, download e configurações.

A descrição atual informa que a consulta é direta na SEFAZ e o Portal é fallback.

## Diagnóstico

O painel de configurações do site mostra:

- extensão;
- versão;
- **Consulta direta**: configurada / configurar CNPJ / atualizar extensão;
- **Portal fallback**.

O CNPJ do A1 é editado nas opções da própria extensão, abertas ao clicar no ícone da extensão.

## Consulta

A tela aceita uma ou várias chaves.

Fluxo visível:

1. consulta direta SEFAZ;
2. se houver XML, ações DANFE/XML ficam disponíveis;
3. se a regra fiscal exigir fallback, o Portal abre;
4. hCaptcha é resolvido manualmente;
5. resultado retorna ao mesmo card/lista.

A UI indica a origem `SEFAZ` ou `Portal` em itens concluídos.

## Segurança

Nenhuma UI pede PFX/P12 ou senha do certificado. O CNPJ de identidade fiscal fica somente em storage local da extensão.
