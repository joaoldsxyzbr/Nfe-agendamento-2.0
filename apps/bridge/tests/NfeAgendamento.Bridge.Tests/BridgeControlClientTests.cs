using NfeAgendamento.App.Runtime;
using NfeAgendamento.Bridge.Runtime;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class BridgeControlClientTests
{
    [Fact]
    public async Task Claim_validates_identity_then_uses_the_lease_for_heartbeat_and_shutdown()
    {
        var expectedPath = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "NfeAgendamento.Bridge.exe"));
        var identity = new BridgeControlIdentity(321, "0.0.6", expectedPath, "instance", Managed: true);
        var transport = new RecordingTransport(
            new BridgeControlResponse(BridgeControlProtocol.ProtocolVersion, true, Identity: identity),
            new BridgeControlResponse(BridgeControlProtocol.ProtocolVersion, true, LeaseId: "lease-1"),
            new BridgeControlResponse(BridgeControlProtocol.ProtocolVersion, true),
            new BridgeControlResponse(BridgeControlProtocol.ProtocolVersion, true));
        var client = new BridgeControlClient(transport, expectedPath, "0.0.6");

        var claimed = await client.ClaimAsync(TestContext.Current.CancellationToken);
        await client.HeartbeatAsync(TestContext.Current.CancellationToken);
        await client.ShutdownAsync(TestContext.Current.CancellationToken);

        Assert.Equal(identity, claimed);
        Assert.Collection(
            transport.Requests,
            request => Assert.Equal(BridgeControlMessageTypes.Hello, request.Type),
            request => Assert.Equal(BridgeControlMessageTypes.ClaimLease, request.Type),
            request =>
            {
                Assert.Equal(BridgeControlMessageTypes.Heartbeat, request.Type);
                Assert.Equal("lease-1", request.LeaseId);
            },
            request =>
            {
                Assert.Equal(BridgeControlMessageTypes.Shutdown, request.Type);
                Assert.Equal("lease-1", request.LeaseId);
            });
    }

    [Fact]
    public async Task Claim_rejects_an_unmanaged_or_unexpected_bridge_identity_before_claiming_lease()
    {
        var expectedPath = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "expected", "NfeAgendamento.Bridge.exe"));
        var wrongPath = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "other", "NfeAgendamento.Bridge.exe"));
        var identity = new BridgeControlIdentity(777, "0.0.6", wrongPath, "foreign", Managed: true);
        var transport = new RecordingTransport(
            new BridgeControlResponse(BridgeControlProtocol.ProtocolVersion, true, Identity: identity));
        var client = new BridgeControlClient(transport, expectedPath, "0.0.6");

        var exception = await Assert.ThrowsAsync<InvalidDataException>(
            () => client.ClaimAsync(TestContext.Current.CancellationToken));

        Assert.Contains("identidade", exception.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Single(transport.Requests);
        Assert.Equal(BridgeControlMessageTypes.Hello, transport.Requests[0].Type);
    }

    private sealed class RecordingTransport(params BridgeControlResponse[] responses) : IBridgeControlTransport
    {
        private readonly Queue<BridgeControlResponse> _responses = new(responses);
        public List<BridgeControlRequest> Requests { get; } = [];

        public Task<BridgeControlResponse> SendAsync(
            BridgeControlRequest request,
            CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(_responses.Dequeue());
        }
    }
}
