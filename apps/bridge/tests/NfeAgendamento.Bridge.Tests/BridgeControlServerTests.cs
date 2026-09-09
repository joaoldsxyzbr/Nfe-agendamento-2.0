using NfeAgendamento.Bridge.Runtime;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class BridgeControlServerTests
{
    private static readonly DateTimeOffset Now = new(2026, 9, 9, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Handler_exposes_identity_claims_one_lease_and_only_owner_can_shutdown()
    {
        var state = new BridgeControlState(
            new BridgeControlIdentity(4321, "0.0.6", "C:\\app\\NfeAgendamento.Bridge.exe", "instance", true),
            Now,
            TimeSpan.FromSeconds(10),
            TimeSpan.FromSeconds(8));
        var handler = new BridgeControlRequestHandler(state, () => Now);

        var hello = handler.Handle(new BridgeControlRequest(
            BridgeControlProtocol.ProtocolVersion,
            BridgeControlMessageTypes.Hello));
        Assert.True(hello.Response.Success);
        Assert.Equal(state.Identity, hello.Response.Identity);
        Assert.False(hello.StopApplication);

        var claim = handler.Handle(new BridgeControlRequest(
            BridgeControlProtocol.ProtocolVersion,
            BridgeControlMessageTypes.ClaimLease));
        Assert.True(claim.Response.Success);
        Assert.False(string.IsNullOrWhiteSpace(claim.Response.LeaseId));

        var secondClaim = handler.Handle(new BridgeControlRequest(
            BridgeControlProtocol.ProtocolVersion,
            BridgeControlMessageTypes.ClaimLease));
        Assert.False(secondClaim.Response.Success);

        var wrongShutdown = handler.Handle(new BridgeControlRequest(
            BridgeControlProtocol.ProtocolVersion,
            BridgeControlMessageTypes.Shutdown,
            "wrong"));
        Assert.False(wrongShutdown.Response.Success);
        Assert.False(wrongShutdown.StopApplication);

        var shutdown = handler.Handle(new BridgeControlRequest(
            BridgeControlProtocol.ProtocolVersion,
            BridgeControlMessageTypes.Shutdown,
            claim.Response.LeaseId));
        Assert.True(shutdown.Response.Success);
        Assert.True(shutdown.StopApplication);
    }

    [Fact]
    public void Handler_rejects_unknown_command()
    {
        var state = new BridgeControlState(
            new BridgeControlIdentity(4321, "0.0.6", "C:\\app\\NfeAgendamento.Bridge.exe", "instance", true),
            Now,
            TimeSpan.FromSeconds(10),
            TimeSpan.FromSeconds(8));
        var handler = new BridgeControlRequestHandler(state, () => Now);

        var result = handler.Handle(new BridgeControlRequest(
            BridgeControlProtocol.ProtocolVersion,
            "unknown"));

        Assert.False(result.Response.Success);
        Assert.Equal("unsupported_command", result.Response.Error);
        Assert.False(result.StopApplication);
    }

    [Fact]
    public void Managed_server_is_current_user_only_and_real_entry_only()
    {
        var root = RepositoryRoot();
        var serverPath = Path.Combine(root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "Runtime", "BridgeControlServer.cs");
        Assert.True(File.Exists(serverPath), "O servidor de controle do Bridge ainda não existe.");
        var server = File.ReadAllText(serverPath);
        var program = File.ReadAllText(Path.Combine(root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "Program.cs"));

        Assert.Contains("PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly", server);
        Assert.Contains("BridgeControlConstants.PipeName", server);
        Assert.Contains("BackgroundService", server);
        Assert.Contains("--managed", program);
        Assert.Contains("Assembly.GetEntryAssembly() == typeof(Program).Assembly", program);
        Assert.Contains("AddHostedService<BridgeControlServer>", program);
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
