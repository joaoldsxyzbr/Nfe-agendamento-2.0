using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class TrayUpdaterStaticTests
{
    [Fact]
    public void Tray_app_exposes_manual_confirmed_update_flow()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs"));

        Assert.Contains("Verificar atualizações", program);
        Assert.Contains("CheckForUpdatesAsync", program);
        Assert.Contains("new UpdateService", program);
        Assert.Contains("MessageBoxButtons.YesNo", program);
        Assert.Contains("DownloadAsync", program);
        Assert.Contains("UseShellExecute = true", program);
        Assert.Contains("ExitThread()", program);
        Assert.Contains("Assembly.GetExecutingAssembly().GetName().Version", program);
    }

    [Fact]
    public void Tray_owns_only_its_bridge_process_and_monitors_single_instance_mutex()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs"));

        Assert.DoesNotContain("Process.GetProcessesByName", program);
        Assert.DoesNotContain("StopExistingBridgeProcesses", program);
        Assert.Contains("BridgeSingleInstanceName", program);
        Assert.Contains("Mutex.TryOpenExisting", program);
        Assert.Contains("System.Windows.Forms.Timer", program);
        Assert.Contains("_bridgeMonitor", program);
        Assert.Contains("Bridge indisponível", program);
        Assert.Contains("_bridgeProcess.Kill(entireProcessTree: true)", program);
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "package.json")))
            directory = directory.Parent;

        Assert.NotNull(directory);
        return directory.FullName;
    }
}
