# NFe Agendamento 2.0 — Instalador Windows do Bridge

Data: 2026-09-08
Status: aprovado e implementado; release `v0.0.2` preparada para publicação após CI final verde

## 1. Objetivo

Substituir o ZIP portátil como experiência principal de instalação do Bridge por um instalador Windows simples, por usuário e sem elevação administrativa.

O Bridge continua sendo um intermediário mínimo entre o site, o certificado A1 local e o fallback Portal/WebView2. Esta mudança altera somente distribuição, instalação e identidade visual do executável; não altera o protocolo fiscal, API local, DANFE, Fernando Klein ou arquitetura Site + Bridge.

## 2. Decisões fechadas

- tecnologia do instalador: Inno Setup;
- versão alvo: `v0.0.2`;
- instalação sem administrador;
- diretório: `%LOCALAPPDATA%\NFe Agendamento Bridge`;
- instalação somente para o usuário atual;
- Bridge inicia automaticamente no login do usuário;
- não haverá updater automático;
- `Setup.exe` será o download principal da release;
- ZIP continuará disponível como fallback técnico;
- Bridge e helper `NfeAgendamento.Portal.exe` permanecem lado a lado;
- desinstalação deve remover atalhos, auto-start e arquivos instalados;
- configurações locais do Bridge em `%LOCALAPPDATA%/NfeAgendamentoBridge` não serão apagadas automaticamente na desinstalação, preservando a seleção do certificado caso o usuário reinstale;
- nenhum serviço Windows será criado;
- nenhuma tarefa agendada será criada;
- nenhuma permissão administrativa será solicitada.

## 3. Experiência de instalação

Fluxo esperado:

1. usuário baixa `NFeAgendamentoBridge-Setup-v0.0.2.exe`;
2. abre o instalador sem UAC/admin;
3. instalador copia Bridge + helper Portal para `%LOCALAPPDATA%\NFe Agendamento Bridge`;
4. cria atalho no Menu Iniciar;
5. registra inicialização automática somente para o usuário atual;
6. ao finalizar, inicia o Bridge;
7. nos próximos logins, o Bridge inicia automaticamente;
8. o usuário acessa o site normalmente e o site encontra `127.0.0.1:17345`.

O instalador não adiciona UI permanente ao Bridge e não cria processo central de atualização.

## 4. Auto-start

O auto-start será registrado no escopo do usuário (`HKCU`), apontando para o executável instalado.

Requisitos:

- não requer admin;
- deve ser removido pela desinstalação;
- deve apontar para o caminho real do executável instalado;
- não deve iniciar múltiplas instâncias intencionalmente;
- o Bridge continua sendo responsável por falhar de forma clara se a porta local já estiver ocupada.

## 5. Ícone

Será criado um ícone próprio para o produto, coerente com o site atual:

- base azul-escura;
- destaque amarelo;
- símbolo simples de documento/NF combinado com engrenagem;
- legível em tamanhos pequenos;
- sem texto dentro do ícone.

O mesmo ícone será usado em:

- `NfeAgendamento.Bridge.exe`;
- atalho do Menu Iniciar;
- instalador Inno Setup;
- entrada de desinstalação quando suportado pelo instalador.

O helper Portal não precisa ganhar identidade visual separada nesta versão.

## 6. Estrutura de arquivos

Adicionar ao repositório:

```text
apps/
  bridge/
    installer/
      NfeAgendamentoBridge.iss
    assets/
      nfe-agendamento-bridge.ico
```

O publish continuará produzindo Bridge e Portal lado a lado antes do Inno Setup empacotar o diretório final.

## 7. CI e empacotamento

O job Windows deverá:

1. publicar o Bridge para `win-x64`;
2. publicar o Portal helper para o mesmo diretório;
3. compilar o script Inno Setup;
4. validar que o `Setup.exe` foi gerado;
5. subir dois artifacts:
   - instalador `.exe`;
   - ZIP técnico com o conteúdo publicado.

A release `v0.0.2` só será criada após web + Bridge + helper + empacotamento do instalador passarem no CI.

## 8. Release v0.0.2

Assets esperados:

- `NFeAgendamentoBridge-Setup-v0.0.2.exe` — principal;
- `NfeAgendamentoBridge-win-x64.zip` — fallback técnico.

As notas da release devem deixar explícito:

- instalação por usuário, sem administrador;
- início automático com o Windows;
- requisitos de .NET 10 Desktop Runtime e WebView2 Runtime;
- necessidade de origem HTTPS permitida em `Bridge:AllowedOrigins` quando aplicável;
- ausência de atualização automática;
- teste físico Windows continua sendo necessário para validar A1/SEFAZ/Portal em ambiente real.

## 9. Segurança e escopo

O instalador não deve:

- abrir bind LAN;
- alterar firewall;
- instalar certificado;
- solicitar senha de PFX;
- copiar chave privada;
- criar serviço Windows;
- criar updater/background downloader;
- executar código baixado de URL externa;
- alterar navegador ou permissões de rede local.

A segurança existente do Bridge (`127.0.0.1`, Origin/Host/CORS) permanece inalterada.

## 10. Testes

Cobertura automatizada mínima:

- script Inno contém `PrivilegesRequired=lowest`;
- diretório de instalação usa `{localappdata}`;
- auto-start usa escopo de usuário;
- desinstalação remove a entrada de auto-start;
- executável/atalho usam o ícone próprio;
- pipeline Windows compila o instalador;
- CI falha se o Setup não existir;
- release workflow só publica após CI verde.

Validação física posterior:

- instalar sem prompt de administrador;
- confirmar arquivos em `%LOCALAPPDATA%`;
- confirmar Bridge em execução após instalação;
- reiniciar/login e confirmar auto-start;
- abrir site e detectar Bridge;
- selecionar certificado A1;
- desinstalar e confirmar remoção do executável/atalho/auto-start;
- confirmar que configuração de certificado pode permanecer para reinstalação.

## 11. Critérios de aceite

A mudança está pronta quando:

1. existe um `Setup.exe` gerado automaticamente no CI;
2. instalação não exige administrador;
3. Bridge + Portal ficam instalados por usuário;
4. Bridge inicia após instalar e em logins futuros;
5. Menu Iniciar possui atalho com ícone próprio;
6. desinstalação é limpa e remove auto-start;
7. nenhum updater automático foi introduzido;
8. ZIP continua disponível como fallback técnico;
9. CI completo permanece verde;
10. release `v0.0.2` contém Setup + ZIP.

## 12. Revisão do design

Revisão de 2026-09-08:

- sem `TBD`/`TODO`;
- não altera arquitetura fiscal;
- não exige privilégio administrativo;
- não adiciona serviço ou updater;
- auto-start é por usuário e reversível;
- identidade visual é limitada ao Bridge/instalador;
- estratégia de release e artifacts está definida;
- critérios de aceite são verificáveis.
