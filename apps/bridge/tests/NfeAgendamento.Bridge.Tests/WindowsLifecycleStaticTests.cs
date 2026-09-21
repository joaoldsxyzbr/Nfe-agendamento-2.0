using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class WindowsLifecycleStaticTests
{
    [Fact]
    public void Retired_app_and_managed_control_protocol_are_absent()
    {
        var root = RepositoryRoot();

        Assert.False(Directory.Exists(Path.Combine(
            root, "apps", "bridge", "windows", "NfeAgendamento.App")));

        foreach (var file in new[]
        {
            "BridgeControlContracts.cs",
            "BridgeControlProtocol.cs",
            "BridgeControlRequestHandler.cs",
            "BridgeControlServer.cs",
            "BridgeControlState.cs",
        })
        {
            Assert.False(File.Exists(Path.Combine(
                root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "Runtime", file)),
                $"Protocolo de supervisão legado ainda presente: {file}");
        }

        var testProject = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "tests", "NfeAgendamento.Bridge.Tests", "NfeAgendamento.Bridge.Tests.csproj"));
        Assert.DoesNotContain("NfeAgendamento.App", testProject, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Bridge_is_single_instance_standalone_without_managed_mode()
    {
        var root = RepositoryRoot();
        var program = File.ReadAllText(Path.Combine(
            root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "Program.cs"));

        Assert.Contains("BridgeSingleInstance.TryAcquire", program);
        Assert.DoesNotContain("--managed", program, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("BridgeControlServer", program, StringComparison.Ordinal);
        Assert.DoesNotContain("BridgeControlState", program, StringComparison.Ordinal);
        Assert.DoesNotContain("BridgeControlIdentity", program, StringComparison.Ordinal);
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
