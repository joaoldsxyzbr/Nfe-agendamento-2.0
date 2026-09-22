# Tela de consulta

## Cabeçalho

À esquerda: logo, nome e descrição. À direita: status da extensão, download e configurações.

A descrição vigente informa que a consulta é feita pelo Portal Nacional.

## Diagnóstico

O painel de configurações mostra:

- extensão;
- versão;
- **Portal Nacional**: disponível / indisponível;
- **Regras de fornecedor**: disponíveis / indisponíveis.

Não existe diagnóstico de consulta direta nem configuração de CNPJ do A1.

## Consulta

A tela aceita uma ou várias chaves.

Fluxo visível:

1. o usuário inicia a consulta;
2. o Portal Nacional abre em popup;
3. hCaptcha é resolvido manualmente;
4. o XML retorna automaticamente ao site;
5. ações DANFE/XML ficam disponíveis.

Em lote, os itens são processados sequencialmente e a origem concluída é `Portal`.

## Segurança

Nenhuma UI pede PFX/P12, senha ou chave privada. O navegador trata o certificado quando o Portal exigir. Regras privadas de fornecedor permanecem somente no storage local da extensão.
