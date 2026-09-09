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
    public void Bridge_uses_canonical_version_and_custom_icon()
    {
        var root = RepositoryRoot();
        var props = File.ReadAllText(Path.Combine(root, "Directory.Build.props"));
        var project = File.ReadAllText(Path.Combine(root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "NfeAgendamento.Bridge.csproj"));
        var iconPath = Path.Combine(root, "apps", "bridge", "assets", "nfe-agendamento-bridge.ico");

        Assert.Contains("<Version>0.0.6</Version>", props);
        Assert.DoesNotContain("<Version>", project);
        Assert.Contains("<ApplicationIcon>..\\..\\assets\\nfe-agendamento-bridge.ico</ApplicationIcon>", project);
        Assert.True(File.Exists(iconPath));
        var header = File.ReadAllBytes(iconPath).Take(4).ToArray();
        Assert.Equal(new byte[] { 0x00, 0x00, 0x01, 0x00 }, header);
    }

    [Fact]
    public void Portal_helper_inherits_canonical_package_version()
    {
        var root = RepositoryRoot();
        var props = File.ReadAllText(Path.Combine(root, "Directory.Build.props"));
        var project = File.ReadAllText(Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.Portal", "NfeAgendamento.Portal.csproj"));
        Assert.Contains("<Version>0.0.6</Version>", props);
        Assert.DoesNotContain("<Version>", project);
    }

    [Fact]
    public void Installer_is_per_user_autostart_and_has_no_privileged_components()
    {
        var root = RepositoryRoot();
        var installerPath = Path.Combine(root, "apps", "bridge", "installer", "NfeAgendamentoBridge.iss");
        Assert.True(File.Exists(installerPath), "O script Inno Setup ainda não existe.");
        var iss = File.ReadAllText(installerPath);

        Assert.Contains("#ifndef MyAppVersion", iss);
        Assert.Contains("OutputBaseFilename=NFeAgendamentoBridge-Setup-v{#MyAppVersion}", iss);
        Assert.Contains("PrivilegesRequired=lowest", iss);
        Assert.Contains("DefaultDirName={localappdata}\\NFe Agendamento Bridge", iss);
        Assert.Contains("Root: HKCU", iss);
        Assert.Contains("Software\\Microsoft\\Windows\\CurrentVersion\\Run", iss);
        Assert.Contains("uninsdeletevalue", iss);
        Assert.Contains("{app}\\NfeAgendamento.App.exe", iss);
        Assert.Contains("IconFilename: \"{app}\\NfeAgendamento.App.exe\"", iss);
        Assert.Contains("SetupIconFile=..\\assets\\nfe-agendamento-bridge.ico", iss);
        Assert.Contains("UninstallDisplayIcon={app}\\NfeAgendamento.App.exe", iss);
        Assert.Contains("Filename: \"{app}\\NfeAgendamento.App.exe\"", iss);
        Assert.Contains("Description: \"Iniciar NFe Agendamento\"", iss);
        Assert.Contains("WorkingDir: \"{app}\"", iss);
        Assert.DoesNotContain("PrivilegesRequired=admin", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("netsh", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sc.exe", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("schtasks", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("http://", iss, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Production_origin_is_fixed_without_installer_prompt()
    {
        var root = RepositoryRoot();
        var appsettings = File.ReadAllText(Path.Combine(root,
            "apps", "bridge", "src", "NfeAgendamento.Bridge", "appsettings.json"));
        var iss = File.ReadAllText(Path.Combine(root,
            "apps", "bridge", "installer", "NfeAgendamentoBridge.iss"));

        Assert.Contains("https://nfeagendamento.joaolds.xyz.br", appsettings);
        Assert.DoesNotContain("CreateInputQueryPage", iss);
        Assert.DoesNotContain("SITEORIGIN", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Bridge:AllowedOrigins", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Parameters:", iss, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Ci_publishes_windows_components_self_contained()
    {
        var root = RepositoryRoot();
        var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));

        Assert.Contains("dotnet publish apps/bridge/src/NfeAgendamento.Bridge/NfeAgendamento.Bridge.csproj -c Release -r win-x64 --self-contained true", ci);
        Assert.Contains("dotnet publish apps/bridge/windows/NfeAgendamento.Portal/NfeAgendamento.Portal.csproj -c Release -r win-x64 --self-contained true", ci);
        Assert.Contains("dotnet publish apps/bridge/windows/NfeAgendamento.App/NfeAgendamento.App.csproj -c Release -r win-x64 --self-contained true", ci);
        Assert.DoesNotContain("--self-contained false", ci);
    }

    [Fact]
    public void Ci_builds_and_uploads_versioned_setup_and_portable_fallback()
    {
        var root = RepositoryRoot();
        var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));

        Assert.Contains("Directory.Build.props", ci);
        Assert.Contains("Inno Setup 6\\ISCC.exe", ci);
        Assert.Contains("/DMyAppVersion=$version", ci);
        Assert.Contains("NFeAgendamentoBridge-Setup-v${{ steps.version.outputs.version }}", ci);
        Assert.Contains("name: NfeAgendamentoBridge-win-x64", ci);
        Assert.Contains("if (!(Test-Path $setup))", ci);
    }

    [Fact]
    public void Ci_uses_repository_global_json_for_dotnet_sdk()
    {
        var root = RepositoryRoot();
        var globalJsonPath = Path.Combine(root, "global.json");
        var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));

        Assert.True(File.Exists(globalJsonPath), "global.json deve fixar a estratégia do SDK .NET.");
        var globalJson = File.ReadAllText(globalJsonPath);
        Assert.Contains("\"version\": \"10.0.401\"", globalJson);
        Assert.Contains("\"rollForward\": \"latestPatch\"", globalJson);
        Assert.Contains("actions/setup-dotnet@v6", ci);
        Assert.DoesNotContain("dotnet-version:", ci);
    }

    [Fact]
    public void Generic_release_uses_only_artifacts_from_successful_ci_run_and_pins_the_validated_sha()
    {
        var root = RepositoryRoot();
        var workflowPath = Path.Combine(root, ".github", "workflows", "release.yml");
        Assert.True(File.Exists(workflowPath), "O workflow genérico de release ainda não existe.");
        var workflow = File.ReadAllText(workflowPath);

        Assert.Contains("workflows: [CI]", workflow);
        Assert.Contains("github.event.workflow_run.conclusion == 'success'", workflow);
        Assert.Contains("github.event.workflow_run.head_branch == 'main'", workflow);
        Assert.Contains("startsWith(github.event.workflow_run.head_commit.message, 'release: v')", workflow);
        Assert.Contains("Directory.Build.props", workflow);
        Assert.Contains("run-id: ${{ github.event.workflow_run.id }}", workflow);
        Assert.Contains("NFeAgendamentoBridge-Setup-v${version}.exe", workflow);
        Assert.Contains("validated_sha=\"${{ github.event.workflow_run.head_sha }}\"", workflow);
        Assert.Contains("gh api \"repos/${GITHUB_REPOSITORY}/commits/$tag\"", workflow);
        Assert.Contains("existing_sha", workflow);
        Assert.Contains("--target \"$validated_sha\"", workflow);
        Assert.Contains("gh release create \"$tag\"", workflow);
        Assert.Contains("--notes-file", workflow);
        Assert.Contains("uses: actions/checkout@v7", workflow);
        Assert.Contains("uses: actions/download-artifact@v8", workflow);
    }

    [Fact]
    public void Existing_release_must_match_the_validated_assets_before_skipping_publication()
    {
        var root = RepositoryRoot();
        var workflow = File.ReadAllText(Path.Combine(root, ".github", "workflows", "release.yml"));

        Assert.Contains("verify_release_asset", workflow);
        Assert.Contains("releases/tags/$tag", workflow);
        Assert.Contains("sha256sum", workflow);
        Assert.Contains("digest", workflow);
        Assert.Contains("size", workflow);
    }
}
