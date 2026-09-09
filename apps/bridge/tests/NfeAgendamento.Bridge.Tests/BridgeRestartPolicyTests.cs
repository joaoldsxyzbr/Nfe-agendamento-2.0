using NfeAgendamento.App.Runtime;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class BridgeRestartPolicyTests
{
    [Fact]
    public void Failures_use_bounded_one_two_five_second_backoff_then_open_circuit()
    {
        var now = new DateTimeOffset(2026, 9, 9, 17, 0, 0, TimeSpan.Zero);
        var policy = new BridgeRestartPolicy(TimeSpan.FromSeconds(30));

        Assert.Equal(TimeSpan.FromSeconds(1), policy.RegisterFailure(now));
        Assert.Equal(TimeSpan.FromSeconds(2), policy.RegisterFailure(now));
        Assert.Equal(TimeSpan.FromSeconds(5), policy.RegisterFailure(now));
        Assert.Null(policy.RegisterFailure(now));
        Assert.True(policy.IsCircuitOpen(now));
        Assert.False(policy.CanAttempt(now));

        var afterCooldown = now.AddSeconds(31);
        Assert.False(policy.IsCircuitOpen(afterCooldown));
        Assert.True(policy.CanAttempt(afterCooldown));
        Assert.Equal(TimeSpan.FromSeconds(1), policy.RegisterFailure(afterCooldown));
    }

    [Fact]
    public void Healthy_bridge_resets_restart_history()
    {
        var now = DateTimeOffset.UtcNow;
        var policy = new BridgeRestartPolicy(TimeSpan.FromSeconds(30));

        Assert.Equal(TimeSpan.FromSeconds(1), policy.RegisterFailure(now));
        Assert.Equal(TimeSpan.FromSeconds(2), policy.RegisterFailure(now));
        policy.RegisterHealthy();

        Assert.Equal(TimeSpan.FromSeconds(1), policy.RegisterFailure(now));
        Assert.False(policy.IsCircuitOpen(now));
    }
}
