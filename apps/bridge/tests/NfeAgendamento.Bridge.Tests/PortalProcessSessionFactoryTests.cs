using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalProcessSessionFactoryTests
{
    [Fact]
    public void Server_start_info_is_hidden_and_contains_only_local_bootstrap_arguments()
    {
        var startInfo = PortalProcessSessionFactory.CreateServerStartInfo(
            "C:\\NfeAgendamento.Portal.exe",
            "nfe-portal-test",
            4321,
            "C:\\app");

        Assert.Equal("C:\\NfeAgendamento.Portal.exe", startInfo.FileName);
        Assert.False(startInfo.UseShellExecute);
        Assert.True(startInfo.CreateNoWindow);
        Assert.Equal("C:\\app", startInfo.WorkingDirectory);
        Assert.Equal(
            ["--server", "--pipe-name", "nfe-portal-test", "--parent-pid", "4321"],
            startInfo.ArgumentList.ToArray());
    }

    [Fact]
    public void Ready_message_must_be_exactly_the_server_readiness_contract()
    {
        PortalProcessSessionFactory.ValidateReady(new PortalIpcEnvelope(PortalIpcMessageType.Ready));

        Assert.Throws<InvalidDataException>(() =>
            PortalProcessSessionFactory.ValidateReady(new PortalIpcEnvelope(PortalIpcMessageType.Completed, "op")));
        Assert.Throws<InvalidDataException>(() =>
            PortalProcessSessionFactory.ValidateReady(new PortalIpcEnvelope(PortalIpcMessageType.Ready, "unexpected-op")));
    }
}
