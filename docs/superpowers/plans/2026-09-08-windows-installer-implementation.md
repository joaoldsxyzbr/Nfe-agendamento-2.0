# Windows Installer v0.0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o pacote portátil do Bridge em um instalador Windows por usuário, sem administrador, com auto-start, ícone próprio e release `v0.0.2` contendo Setup + ZIP técnico.

**Architecture:** O Bridge e o helper Portal continuam sendo publicados lado a lado. O Inno Setup empacota esse diretório em `%LOCALAPPDATA%\NFe Agendamento Bridge`, cria atalho e auto-start em `HKCU`, sem serviço, tarefa agendada, updater ou elevação. O CI Windows passa a compilar e validar o `Setup.exe`; a release só publica assets provenientes de um CI verde.

**Tech Stack:** .NET 10, ASP.NET Core, WinForms/WebView2, xUnit v3, Inno Setup 6, GitHub Actions, PowerShell.

**Spec:** `docs/superpowers/specs/2026-09-08-windows-installer-design.md`

## Global Constraints

- Versão alvo: `v0.0.2`.
- Instalação por usuário em `%LOCALAPPDATA%\NFe Agendamento Bridge`.
- `PrivilegesRequired=lowest`; nenhuma elevação administrativa.
- Auto-start somente em `HKCU`.
- Bridge e `NfeAgendamento.Portal.exe` permanecem lado a lado.
- Nenhum serviço Windows, tarefa agendada ou updater automático.
- Nenhuma alteração de firewall, certificado, PFX, navegador ou bind LAN.
- Segurança atual do Bridge em `127.0.0.1`, Origin/Host/CORS permanece intacta.
- Configuração persistida em `%LOCALAPPDATA%\NfeAgendamentoBridge` não é removida na desinstalação.
- Asset principal da release: `NFeAgendamentoBridge-Setup-v0.0.2.exe`.
- Asset técnico mantido: `NfeAgendamentoBridge-win-x64.zip`.

---

## File Map

- `apps/bridge/assets/nfe-agendamento-bridge.ico` — ícone multi-size azul/amarelo do produto.
- `apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj` — versão `0.0.2` e `ApplicationIcon`.
- `apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj` — versão `0.0.2` do helper empacotado.
- `apps/bridge/installer/NfeAgendamentoBridge.iss` — contrato completo do instalador por usuário.
- `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs` — regressões de versão, ícone, segurança e script Inno.
- `.github/workflows/ci.yml` — publish Windows + compilação do Inno + artifacts Setup/ZIP.
- `.github/workflows/release-v0.0.2.yml` — publicação condicionada ao CI verde e commit marcador.
- `docs/releases/v0.0.2.md` — notas da release.
- `docs/testing/acceptance.md` — checklist físico de instalação/auto-start/desinstalação.
- `README.md` — distribuição principal via Setup e requisitos.

---

### Task 1: Travar identidade visual e versão do executável

**Files:**
- Create: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs`
- Create: `apps/bridge/assets/nfe-agendamento-bridge.ico`
- Modify: `apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj`
- Modify: `apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj`

**Interfaces:**
- Produces: `NfeAgendamento.Bridge.exe` com versão `0.0.2` e ícone próprio.
- Produces: helper Portal com versão de produto `0.0.2`.

- [ ] **Step 1: escrever RED para versão e ícone**

Create `InstallerStaticTests.cs` com helper de raiz idêntico ao padrão de `PortalHelperStaticTests.cs` e os testes:

```csharp
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class InstallerStaticTests
{
    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "package.json")))
            directory = directory.Parent;

        Assert.NotNull(directory);
        return directory.FullName;
    }

    [Fact]
    public void Bridge_has_v002_identity_and_custom_icon()
    {
        var root = RepositoryRoot();
        var project = File.ReadAllText(Path.Combine(root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "NfeAgendamento.Bridge.csproj"));
        var iconPath = Path.Combine(root, "apps", "bridge", "assets", "nfe-agendamento-bridge.ico");

        Assert.Contains("<Version>0.0.2</Version>", project);
        Assert.Contains("<ApplicationIcon>..\\..\\assets\\nfe-agendamento-bridge.ico</ApplicationIcon>", project);
        Assert.True(File.Exists(iconPath));
        var header = File.ReadAllBytes(iconPath).Take(4).ToArray();
        Assert.Equal(new byte[] { 0x00, 0x00, 0x01, 0x00 }, header);
    }

    [Fact]
    public void Portal_helper_matches_v002_package_version()
    {
        var root = RepositoryRoot();
        var project = File.ReadAllText(Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.Portal", "NfeAgendamento.Portal.csproj"));
        Assert.Contains("<Version>0.0.2</Version>", project);
    }
}
```

- [ ] **Step 2: rodar RED**

Run:

```bash
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
```

Expected: FAIL apenas nos novos testes porque versão/ícone ainda não existem.

- [ ] **Step 3: gerar o `.ico` aprovado e versionar**

Gerar um ICO multi-size com base azul-escura, documento branco/azulado e engrenagem amarela. Exemplo determinístico com Pillow, executado uma vez para produzir o binário versionado:

```python
from PIL import Image, ImageDraw

sizes = [16, 24, 32, 48, 64, 128, 256]
base = Image.new('RGBA', (256, 256), '#0b1422')
d = ImageDraw.Draw(base)
d.rounded_rectangle((32, 28, 174, 220), radius=22, fill='#1f6feb')
d.polygon([(132, 28), (174, 70), (132, 70)], fill='#9ec5ff')
d.rounded_rectangle((58, 91, 148, 105), radius=7, fill='#eaf2ff')
d.rounded_rectangle((58, 122, 137, 136), radius=7, fill='#eaf2ff')
# engrenagem simplificada: aro amarelo + centro escuro
cx, cy = 173, 171
d.ellipse((127, 125, 219, 217), fill='#f6c945')
d.ellipse((151, 149, 195, 193), fill='#0b1422')
for x1, y1, x2, y2 in [(165,112,181,137),(165,205,181,230),(114,163,139,179),(207,163,232,179),(130,128,148,146),(198,196,216,214),(198,128,216,146),(130,196,148,214)]:
    d.rounded_rectangle((x1,y1,x2,y2), radius=5, fill='#f6c945')
base.save('apps/bridge/assets/nfe-agendamento-bridge.ico', format='ICO', sizes=[(s, s) for s in sizes])
```

- [ ] **Step 4: aplicar versão e `ApplicationIcon`**

Bridge `.csproj` deve conter:

```xml
<Version>0.0.2</Version>
<FileVersion>0.0.2.0</FileVersion>
<AssemblyVersion>0.0.2.0</AssemblyVersion>
<ApplicationIcon>..\..\assets\nfe-agendamento-bridge.ico</ApplicationIcon>
```

Portal `.csproj` deve conter:

```xml
<Version>0.0.2</Version>
<FileVersion>0.0.2.0</FileVersion>
<AssemblyVersion>0.0.2.0</AssemblyVersion>
```

- [ ] **Step 5: rodar GREEN + builds**

Run:

```bash
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release
```

Expected: testes novos PASS, build Bridge PASS, helper PASS com no máximo o warning já conhecido de `WindowsBase`.

- [ ] **Step 6: commit**

Commit: `feat: adicionar identidade visual ao bridge`.

---

### Task 2: Criar instalador Inno Setup por usuário

**Files:**
- Create: `apps/bridge/installer/NfeAgendamentoBridge.iss`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs`

**Interfaces:**
- Consumes: publish em `artifacts/NfeAgendamentoBridge` contendo Bridge + Portal.
- Produces: `artifacts/installer/NFeAgendamentoBridge-Setup-v0.0.2.exe`.

- [ ] **Step 1: adicionar RED do contrato Inno**

Adicionar ao teste:

```csharp
[Fact]
public void Installer_is_per_user_autostart_and_has_no_privileged_components()
{
    var root = RepositoryRoot();
    var iss = File.ReadAllText(Path.Combine(root, "apps", "bridge", "installer", "NfeAgendamentoBridge.iss"));

    Assert.Contains("PrivilegesRequired=lowest", iss);
    Assert.Contains("DefaultDirName={localappdata}\\NFe Agendamento Bridge", iss);
    Assert.Contains("Root: HKCU", iss);
    Assert.Contains("Software\\Microsoft\\Windows\\CurrentVersion\\Run", iss);
    Assert.Contains("uninsdeletevalue", iss);
    Assert.Contains("{app}\\NfeAgendamento.Bridge.exe", iss);
    Assert.Contains("IconFilename: \"{app}\\NfeAgendamento.Bridge.exe\"", iss);
    Assert.Contains("SetupIconFile=..\\assets\\nfe-agendamento-bridge.ico", iss);
    Assert.Contains("UninstallDisplayIcon={app}\\NfeAgendamento.Bridge.exe", iss);
    Assert.Contains("Filename: \"{app}\\NfeAgendamento.Bridge.exe\"; Flags: nowait postinstall skipifsilent", iss);
    Assert.DoesNotContain("PrivilegesRequired=admin", iss, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("netsh", iss, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("sc.exe", iss, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("schtasks", iss, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("http://", iss, StringComparison.OrdinalIgnoreCase);
    Assert.DoesNotContain("https://", iss, StringComparison.OrdinalIgnoreCase);
}
```

- [ ] **Step 2: rodar RED**

Expected: FAIL por ausência de `NfeAgendamentoBridge.iss`.

- [ ] **Step 3: criar script Inno mínimo**

Conteúdo base obrigatório:

```ini
#define MyAppName "NFe Agendamento Bridge"
#define MyAppVersion "0.0.2"
#define MyAppExeName "NfeAgendamento.Bridge.exe"

[Setup]
AppId={{8C8FBD7D-26DB-46C0-A8AB-7F118F42A1B8}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\NFe Agendamento Bridge
DefaultGroupName=NFe Agendamento Bridge
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
OutputDir=..\..\..\artifacts\installer
OutputBaseFilename=NFeAgendamentoBridge-Setup-v0.0.2
SetupIconFile=..\assets\nfe-agendamento-bridge.ico
UninstallDisplayIcon={app}\NfeAgendamento.Bridge.exe
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "..\..\..\artifacts\NfeAgendamentoBridge\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\NFe Agendamento Bridge"; Filename: "{app}\NfeAgendamento.Bridge.exe"; WorkingDir: "{app}"; IconFilename: "{app}\NfeAgendamento.Bridge.exe"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "NFe Agendamento Bridge"; ValueData: """{app}\NfeAgendamento.Bridge.exe"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\NfeAgendamento.Bridge.exe"; Description: "Iniciar NFe Agendamento Bridge"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent
```

Não adicionar `[UninstallDelete]` para `%LOCALAPPDATA%\NfeAgendamentoBridge`, preservando `settings.json`.

- [ ] **Step 4: rodar GREEN estático**

Run suíte Bridge. Expected: todos PASS.

- [ ] **Step 5: commit**

Commit: `feat: adicionar instalador Inno Setup por usuário`.

---

### Task 3: Compilar e validar o Setup no CI Windows

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs`

**Interfaces:**
- Produces artifacts `NFeAgendamentoBridge-Setup-v0.0.2` e `NfeAgendamentoBridge-win-x64`.

- [ ] **Step 1: RED do workflow**

Adicionar teste:

```csharp
[Fact]
public void Ci_builds_and_uploads_setup_and_zip_fallback()
{
    var root = RepositoryRoot();
    var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));

    Assert.Contains("Inno Setup 6\\ISCC.exe", ci);
    Assert.Contains("NFeAgendamentoBridge-Setup-v0.0.2.exe", ci);
    Assert.Contains("name: NFeAgendamentoBridge-Setup-v0.0.2", ci);
    Assert.Contains("name: NfeAgendamentoBridge-win-x64", ci);
    Assert.Contains("if (!(Test-Path $setup))", ci);
}
```

- [ ] **Step 2: rodar RED**

Expected: FAIL porque CI ainda só sobe o pacote técnico.

- [ ] **Step 3: adicionar build real do Inno**

No job `windows-package`, após publicar Bridge/Portal:

```yaml
      - name: Build installer
        shell: pwsh
        run: |
          $iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
          if (!(Test-Path $iscc)) { throw "Inno Setup 6 não encontrado em $iscc" }
          & $iscc "apps\bridge\installer\NfeAgendamentoBridge.iss"
          if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
          $setup = "artifacts\installer\NFeAgendamentoBridge-Setup-v0.0.2.exe"
          if (!(Test-Path $setup)) { throw "Setup esperado não foi gerado: $setup" }

      - name: Upload installer
        uses: actions/upload-artifact@v4
        with:
          name: NFeAgendamentoBridge-Setup-v0.0.2
          path: artifacts/installer/NFeAgendamentoBridge-Setup-v0.0.2.exe
          if-no-files-found: error
          retention-days: 14
```

Manter o upload atual `NfeAgendamentoBridge-win-x64` sem removê-lo.

- [ ] **Step 4: rodar GREEN local estático e enviar**

Run suíte Bridge; expected PASS. Commit.

- [ ] **Step 5: validar runner Windows real**

Aguardar GitHub Actions do commit. Expected:
- `web` success;
- `bridge` success;
- `windows-package` success;
- artifact `NFeAgendamentoBridge-Setup-v0.0.2` existente;
- artifact `NfeAgendamentoBridge-win-x64` existente.

Se `ISCC.exe` não existir no runner, usar systematic-debugging e só então ajustar a aquisição da dependência; não introduzir download no instalador em runtime.

- [ ] **Step 6: commit**

Commit: `ci: gerar instalador Windows do bridge`.

---

### Task 4: Release v0.0.2 e documentação operacional

**Files:**
- Create: `.github/workflows/release-v0.0.2.yml`
- Create: `docs/releases/v0.0.2.md`
- Modify: `apps/bridge/tests/NfeAgendamento.Bridge.Tests/InstallerStaticTests.cs`
- Modify: `docs/testing/acceptance.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-08-windows-installer-design.md`

**Interfaces:**
- Consumes: artifacts validados pelo `CI` do mesmo commit.
- Produces: GitHub Release `v0.0.2` com Setup + ZIP.

- [ ] **Step 1: RED do workflow de release**

Adicionar teste:

```csharp
[Fact]
public void V002_release_requires_green_ci_and_publishes_both_assets()
{
    var root = RepositoryRoot();
    var workflow = File.ReadAllText(Path.Combine(root, ".github", "workflows", "release-v0.0.2.yml"));

    Assert.Contains("workflow_run.conclusion == 'success'", workflow);
    Assert.Contains("release: v0.0.2", workflow);
    Assert.Contains("NFeAgendamentoBridge-Setup-v0.0.2", workflow);
    Assert.Contains("NfeAgendamentoBridge-win-x64", workflow);
    Assert.Contains("gh release create v0.0.2", workflow);
    Assert.Contains("NFeAgendamentoBridge-Setup-v0.0.2.exe", workflow);
    Assert.Contains("NfeAgendamentoBridge-win-x64.zip", workflow);
}
```

- [ ] **Step 2: rodar RED**

Expected: FAIL porque workflow v0.0.2 ainda não existe.

- [ ] **Step 3: criar workflow de release**

Basear no fluxo `v0.0.1`, mas baixar dois artifacts do `workflow_run` e publicar ambos. Passos essenciais:

```yaml
name: Release v0.0.2

on:
  workflow_run:
    workflows: [CI]
    types: [completed]

permissions:
  actions: read
  contents: write

jobs:
  release:
    if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main'
```

Gate do commit:

```bash
subject="$(git log -1 --format=%s)"
if [[ "$subject" == "release: v0.0.2" ]]; then
  echo "publish=true" >> "$GITHUB_OUTPUT"
else
  echo "publish=false" >> "$GITHUB_OUTPUT"
fi
```

Download:

```yaml
      - uses: actions/download-artifact@v4
        if: steps.gate.outputs.publish == 'true'
        with:
          name: NFeAgendamentoBridge-Setup-v0.0.2
          path: release-installer
          repository: ${{ github.repository }}
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/download-artifact@v4
        if: steps.gate.outputs.publish == 'true'
        with:
          name: NfeAgendamentoBridge-win-x64
          path: release-package
          repository: ${{ github.repository }}
          run-id: ${{ github.event.workflow_run.id }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

Criação do ZIP técnico:

```bash
cd release-package
zip -r ../NfeAgendamentoBridge-win-x64.zip .
```

Publicação:

```bash
gh release create v0.0.2 \
  release-installer/NFeAgendamentoBridge-Setup-v0.0.2.exe \
  NfeAgendamentoBridge-win-x64.zip \
  --repo "$GITHUB_REPOSITORY" \
  --target "$HEAD_SHA" \
  --title "NFe Agendamento 2.0 v0.0.2" \
  --notes-file docs/releases/v0.0.2.md
```

- [ ] **Step 4: escrever notas da v0.0.2**

Notas devem registrar exatamente:
- novo instalador por usuário, sem administrador;
- `%LOCALAPPDATA%\NFe Agendamento Bridge`;
- auto-start no login;
- ícone próprio azul/amarelo;
- sem updater automático;
- .NET 10 Desktop Runtime e WebView2 Runtime continuam requisitos;
- `Bridge:AllowedOrigins` continua obrigatório em produção;
- teste físico A1/SEFAZ/Portal continua pendente até execução em PC real.

- [ ] **Step 5: atualizar aceitação física**

Adicionar seção antes do teste do Bridge:

```markdown
## 0. Instalador v0.0.2

1. Execute `NFeAgendamentoBridge-Setup-v0.0.2.exe` sem privilégios administrativos.
2. Confirme ausência de prompt UAC.
3. Confirme instalação em `%LOCALAPPDATA%\NFe Agendamento Bridge`.
4. Confirme atalho no Menu Iniciar com ícone próprio.
5. Confirme Bridge iniciado ao terminar a instalação.
6. Faça logout/login e confirme auto-start.
7. Desinstale e confirme remoção dos binários, atalho e entrada `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
8. Confirme que `%LOCALAPPDATA%\NfeAgendamentoBridge\settings.json` pode permanecer para reinstalação.
```

- [ ] **Step 6: atualizar README e status da spec**

README passa a tratar Setup como distribuição principal, ZIP como fallback técnico e `v0.0.2` como release alvo. Alterar o status da spec para `aprovado; implementação em execução` enquanto os gates não forem concluídos.

- [ ] **Step 7: rodar GREEN completo antes do marcador**

Aguardar CI do commit documental/workflow. Exigir três jobs verdes e Setup artifact gerado.

- [ ] **Step 8: criar marcador final de release**

Somente depois do CI verde, fazer commit sem mudanças funcionais adicionais com mensagem exata:

```text
release: v0.0.2
```

Esse commit dispara um novo CI; a release só pode nascer após esse CI também ficar verde.

- [ ] **Step 9: verificar release publicada**

Confirmar via API GitHub:
- tag `v0.0.2` aponta para o commit marcador;
- asset `NFeAgendamentoBridge-Setup-v0.0.2.exe` existe;
- asset `NfeAgendamentoBridge-win-x64.zip` existe;
- release não é draft/prerelease;
- release workflow concluiu `success`.

- [ ] **Step 10: commit de contexto não é permitido após a tag**

Toda documentação necessária deve estar no commit marcador. Se houver correção depois da publicação, não reescrever `v0.0.2`; preparar nova versão.

---

## Final Verification

Antes de declarar conclusão:

```bash
npm run test:web
npm run build:web
dotnet run --project apps/bridge/tests/NfeAgendamento.Bridge.Tests/NfeAgendamento.Bridge.Tests.csproj -c Release
dotnet build apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release
dotnet build apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release
```

No GitHub Actions do commit marcador, exigir:
- `web` success incluindo `wrangler deploy --dry-run`;
- `bridge` success;
- `windows-package` success;
- Setup `.exe` gerado e armazenado;
- ZIP técnico armazenado;
- workflow `Release v0.0.2` success;
- release com os dois assets esperados.

O teste físico Windows continua separado: não declarar A1/SEFAZ/Portal fisicamente validados sem executar `docs/testing/acceptance.md` em um PC real.