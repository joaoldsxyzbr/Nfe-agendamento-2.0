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

    [Fact]
    public void Installer_is_per_user_autostart_and_has_no_privileged_components()
    {
        var root = RepositoryRoot();
        var installerPath = Path.Combine(root, "apps", "bridge", "installer", "NfeAgendamentoBridge.iss");
        Assert.True(File.Exists(installerPath), "O script Inno Setup ainda não existe.");
        var iss = File.ReadAllText(installerPath);

        Assert.Contains("PrivilegesRequired=lowest", iss);
        Assert.Contains("DefaultDirName={localappdata}\\NFe Agendamento Bridge", iss);
        Assert.Contains("Root: HKCU", iss);
        Assert.Contains("Software\\Microsoft\\Windows\\CurrentVersion\\Run", iss);
        Assert.Contains("uninsdeletevalue", iss);
        Assert.Contains("{app}\\NfeAgendamento.Bridge.exe", iss);
        Assert.Contains("IconFilename: \"{app}\\NfeAgendamento.Bridge.exe\"", iss);
        Assert.Contains("SetupIconFile=..\\assets\\nfe-agendamento-bridge.ico", iss);
        Assert.Contains("UninstallDisplayIcon={app}\\NfeAgendamento.Bridge.exe", iss);
        Assert.Contains("Filename: \"{app}\\NfeAgendamento.Bridge.exe\"", iss);
        Assert.Contains("Description: \"Iniciar NFe Agendamento Bridge\"", iss);
        Assert.Contains("WorkingDir: \"{app}\"", iss);
        Assert.DoesNotContain("PrivilegesRequired=admin", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("netsh", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sc.exe", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("schtasks", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("http://", iss, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Installer_captures_exact_https_origin_and_applies_it_to_every_launch_path()
    {
        var root = RepositoryRoot();
        var installerPath = Path.Combine(root, "apps", "bridge", "installer", "NfeAgendamentoBridge.iss");
        var iss = File.ReadAllText(installerPath);

        Assert.Contains("CreateInputQueryPage", iss);
        Assert.Contains("IsValidHttpsOrigin", iss);
        Assert.Contains("https://", iss, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Bridge:AllowedOrigins:0", iss);
        Assert.Contains("Pos('/', Rest) = 0", iss);
        Assert.Contains("Pos('?', Rest) = 0", iss);
        Assert.Contains("Pos('#', Rest) = 0", iss);
        Assert.Contains("Parameters: \"{code:GetBridgeArguments}\"", iss);
        Assert.Contains("ValueData: \"\"\"{app}\\NfeAgendamento.Bridge.exe\"\" {code:GetBridgeArguments}\"", iss);
        Assert.DoesNotContain("Bridge:AllowedOrigins:0=*", iss, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Ci_publishes_bridge_and_portal_self_contained_for_windows()
    {
        var root = RepositoryRoot();
        var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));

        Assert.Contains("dotnet publish apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release -r win-x64 --self-contained true", ci);
        Assert.Contains("dotnet publish apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release -r win-x64 --self-contained true", ci);
        Assert.DoesNotContain("--self-contained false", ci);
    }

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

    [Fact]
    public void Release_v002_uses_only_artifacts_from_successful_ci_run()
    {
        var root = RepositoryRoot();
        var workflowPath = Path.Combine(root, ".github", "workflows", "release-v0.0.2.yml");
        Assert.True(File.Exists(workflowPath), "O workflow de release v0.0.2 ainda não existe.");
        var workflow = File.ReadAllText(workflowPath);

        Assert.Contains("workflows: [CI]", workflow);
        Assert.Contains("github.event.workflow_run.conclusion == 'success'", workflow);
        Assert.Contains("github.event.workflow_run.head_branch == 'main'", workflow);
        Assert.Contains("release: v0.0.2", workflow);
        Assert.Contains("name: NFeAgendamentoBridge-Setup-v0.0.2", workflow);
        Assert.Contains("name: NfeAgendamentoBridge-win-x64", workflow);
        Assert.Contains("run-id: ${{ github.event.workflow_run.id }}", workflow);
        Assert.Contains("NFeAgendamentoBridge-Setup-v0.0.2.exe", workflow);
        Assert.Contains("NfeAgendamentoBridge-win-x64.zip", workflow);
        Assert.Contains("gh release create v0.0.2", workflow);
        Assert.Contains("--notes-file docs/releases/v0.0.2.md", workflow);
    }
}
