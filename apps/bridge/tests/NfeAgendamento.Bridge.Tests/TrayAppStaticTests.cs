using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class TrayAppStaticTests
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
    public void Windows_launcher_is_a_real_tray_application()
    {
        var root = RepositoryRoot();
        var projectPath = Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.App", "NfeAgendamento.App.csproj");
        var programPath = Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs");

        Assert.True(File.Exists(projectPath), "O app Windows de bandeja ainda não existe.");
        Assert.True(File.Exists(programPath), "O código do app Windows de bandeja ainda não existe.");

        var project = File.ReadAllText(projectPath);
        var program = File.ReadAllText(programPath);

        Assert.Contains("<TargetFramework>net10.0-windows</TargetFramework>", project);
        Assert.Contains("<OutputType>WinExe</OutputType>", project);
        Assert.Contains("<UseWindowsForms>true</UseWindowsForms>", project);
        Assert.Contains("NotifyIcon", program);
        Assert.Contains("Abrir NFe Agendamento", program);
        Assert.Contains("Sair", program);
    }

    [Fact]
    public void Windows_launcher_starts_bridge_without_console_window()
    {
        var root = RepositoryRoot();
        var programPath = Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs");
        Assert.True(File.Exists(programPath), "O app Windows de bandeja ainda não existe.");

        var program = File.ReadAllText(programPath);
        Assert.Contains("NfeAgendamento.Bridge.exe", program);
        Assert.Contains("CreateNoWindow = true", program);
        Assert.Contains("WindowStyle = ProcessWindowStyle.Hidden", program);
    }

    [Fact]
    public void Windows_launcher_preserves_existing_bridge_and_starts_only_when_absent()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs"));

        Assert.Contains("if (!IsBridgeRunning())", program);
        Assert.Contains("_bridgeProcess = StartBridgeHidden();", program);
        Assert.DoesNotContain("StopExistingBridgeProcesses", program);
        Assert.DoesNotContain("Process.GetProcessesByName", program);
    }

    [Fact]
    public void Installer_exposes_tray_app_instead_of_console_bridge()
    {
        var root = RepositoryRoot();
        var installer = File.ReadAllText(Path.Combine(root, "apps", "bridge", "installer", "NfeAgendamentoBridge.iss"));

        Assert.Contains("#define MyAppExeName \"NfeAgendamento.App.exe\"", installer);
        Assert.Contains("{app}\\NfeAgendamento.App.exe", installer);
        Assert.DoesNotContain("ValueData: \"\"\"{app}\\NfeAgendamento.Bridge.exe\"\"\"", installer);
        Assert.DoesNotContain("Filename: \"{app}\\NfeAgendamento.Bridge.exe\"; Description: \"Iniciar NFe Agendamento Bridge\"", installer);
    }

    [Fact]
    public void Windows_package_publishes_tray_app()
    {
        var root = RepositoryRoot();
        var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));

        Assert.Contains("dotnet publish apps/bridge/windows/NfeAgendamento.App/NfeAgendamento.App.csproj -c Release -r win-x64 --self-contained true", ci);
    }
}
