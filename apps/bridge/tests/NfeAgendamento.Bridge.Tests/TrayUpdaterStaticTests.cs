using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class TrayUpdaterStaticTests
{
    [Fact]
    public void Transition_supervisor_is_headless_and_leaves_site_as_the_only_normal_ui()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "windows", "NfeAgendamento.App", "Program.cs"));

        Assert.Contains("Visible = false", program);
        Assert.DoesNotContain("Abrir NFe Agendamento", program);
        Assert.DoesNotContain("Verificar atualizações", program);
        Assert.DoesNotContain("CheckForUpdatesAsync", program);
        Assert.DoesNotContain("new UpdateService", program);
        Assert.DoesNotContain("ContextMenuStrip", program);
        Assert.DoesNotContain("_notifyIcon.DoubleClick", program);
        Assert.DoesNotContain("OpenSite(", program);
        Assert.DoesNotContain("MessageBox.Show", program);
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
