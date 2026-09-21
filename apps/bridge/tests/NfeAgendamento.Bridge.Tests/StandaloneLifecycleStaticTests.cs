using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class StandaloneLifecycleStaticTests
{
    [Fact]
    public void Bridge_program_keeps_standalone_outside_managed_lease_lifecycle()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "Program.cs"));

        Assert.Contains("string.Equals(argument, \"--managed\"", program);
        Assert.Contains("if (isManaged)", program);
        Assert.Contains("AddHostedService<BridgeControlServer>()", program);
        Assert.Contains("BridgeSingleInstance.TryAcquire", program);
    }

    [Fact]
    public void Installer_standalone_mode_starts_bridge_without_managed_argument()
    {
        var root = RepositoryRoot();
        var installer = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "installer", "NfeAgendamentoBridge.iss"));

        Assert.Contains("#if BridgeAutostartMode == \"standalone\"", installer);
        Assert.Contains("#define MyAppExeName \"NfeAgendamento.Bridge.exe\"", installer);
        Assert.Contains("ValueData: \"\"\"{app}\\{#MyAppExeName}\"\"\"", installer);
        Assert.Contains("Filename: \"{app}\\{#MyAppExeName}\"", installer);
        Assert.DoesNotContain("--managed", installer, StringComparison.OrdinalIgnoreCase);
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
