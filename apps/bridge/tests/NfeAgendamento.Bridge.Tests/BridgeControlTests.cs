using NfeAgendamento.Bridge.Runtime;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class BridgeControlTests
{
    private static readonly DateTimeOffset Start = new(2026, 9, 9, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Managed_bridge_without_lease_stops_only_after_initial_grace_period()
    {
        var state = ManagedState();

        Assert.False(state.ShouldStop(Start.AddSeconds(9)));
        Assert.True(state.ShouldStop(Start.AddSeconds(10)));
    }

    [Fact]
    public void Lease_is_unique_heartbeat_extends_it_and_shutdown_requires_the_owner()
    {
        var state = ManagedState();
        var lease = state.TryClaimLease(Start.AddSeconds(1));

        Assert.False(string.IsNullOrWhiteSpace(lease));
        Assert.Null(state.TryClaimLease(Start.AddSeconds(2)));
        Assert.False(state.Heartbeat("wrong-lease", Start.AddSeconds(2)));
        Assert.True(state.Heartbeat(lease!, Start.AddSeconds(2)));
        Assert.False(state.ShouldStop(Start.AddSeconds(9)));
        Assert.True(state.ShouldStop(Start.AddSeconds(10)));
        Assert.False(state.RequestShutdown("wrong-lease"));
        Assert.True(state.RequestShutdown(lease!));
        Assert.True(state.ShouldStop(Start.AddSeconds(3)));
    }

    [Fact]
    public void Standalone_bridge_does_not_create_a_managed_lease_or_expire()
    {
        var identity = Identity(managed: false);
        var state = new BridgeControlState(
            identity,
            Start,
            initialLeaseTimeout: TimeSpan.FromSeconds(10),
            leaseTimeout: TimeSpan.FromSeconds(8));

        Assert.Null(state.TryClaimLease(Start));
        Assert.False(state.ShouldStop(Start.AddDays(1)));
    }

    [Fact]
    public async Task Protocol_round_trips_a_versioned_request_with_a_small_bounded_frame()
    {
        var request = new BridgeControlRequest(
            BridgeControlProtocol.ProtocolVersion,
            BridgeControlMessageTypes.Heartbeat,
            "lease-123");
        await using var stream = new MemoryStream();

        await BridgeControlProtocol.WriteAsync(stream, request, TestContext.Current.CancellationToken);
        Assert.InRange(stream.Length, 1, BridgeControlProtocol.MaxFrameBytes + sizeof(int));
        stream.Position = 0;

        var roundTrip = await BridgeControlProtocol.ReadRequestAsync(stream, TestContext.Current.CancellationToken);

        Assert.Equal(request, roundTrip);
    }

    [Fact]
    public async Task Protocol_rejects_an_oversized_frame_before_allocating_the_payload()
    {
        await using var stream = new MemoryStream();
        var prefix = BitConverter.GetBytes(BridgeControlProtocol.MaxFrameBytes + 1);
        await stream.WriteAsync(prefix, TestContext.Current.CancellationToken);
        stream.Position = 0;

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            BridgeControlProtocol.ReadRequestAsync(stream, TestContext.Current.CancellationToken));
    }

    private static BridgeControlState ManagedState() => new(
        Identity(managed: true),
        Start,
        initialLeaseTimeout: TimeSpan.FromSeconds(10),
        leaseTimeout: TimeSpan.FromSeconds(8));

    private static BridgeControlIdentity Identity(bool managed) => new(
        ProcessId: 4321,
        Version: "0.0.6",
        ExecutablePath: "C:\\Program Files\\NFe Agendamento Bridge\\NfeAgendamento.Bridge.exe",
        InstanceId: "instance-test",
        Managed: managed);
}
