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
    public void Tray_uses_control_pipe_for_bridge_lifecycle_instead_of_mutex_or_global_process_enumeration()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs"));

        Assert.DoesNotContain("Process.GetProcessesByName", program);
        Assert.DoesNotContain("StopExistingBridgeProcesses", program);
        Assert.DoesNotContain("Mutex.TryOpenExisting", program);
        Assert.Contains("BridgeControlClient", program);
        Assert.Contains("--managed", program);
        Assert.Contains("HeartbeatAsync", program);
        Assert.Contains("ShutdownAsync", program);
        Assert.Contains("BridgeRestartPolicy", program);
        Assert.Contains("System.Windows.Forms.Timer", program);
        Assert.Contains("Bridge indisponível", program);
    }

    [Fact]
    public void Tray_force_kill_is_only_a_fallback_for_the_validated_bridge_process()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs"));

        Assert.Contains("TryForceStopValidatedBridge", program);
        Assert.Contains("bridgeIdentity.ExecutablePath", program);
        Assert.Contains("bridgeIdentity.ProcessId", program);
        Assert.DoesNotContain("GetProcessesByName", program);
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
