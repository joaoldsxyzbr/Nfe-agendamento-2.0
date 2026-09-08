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
        Assert.Contains("Filename: \"{app}\\NfeAgendamento.Bridge.exe\"; Description: \"Iniciar NFe Agendamento Bridge\"; WorkingDir: \"{app}\"; Flags: nowait postinstall skipifsilent", iss);
        Assert.DoesNotContain("PrivilegesRequired=admin", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("netsh", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sc.exe", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("schtasks", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("http://", iss, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("https://", iss, StringComparison.OrdinalIgnoreCase);
    }
}
