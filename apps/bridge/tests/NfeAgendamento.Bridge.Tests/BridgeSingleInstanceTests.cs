using NfeAgendamento.Bridge.Runtime;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class BridgeSingleInstanceTests
{
    [Fact]
    public void Second_instance_with_same_name_is_rejected_until_first_is_disposed()
    {
        var name = $"NfeAgendamento.Bridge.Tests.{Guid.NewGuid():N}";

        Assert.True(BridgeSingleInstance.TryAcquire(name, out var first));
        Assert.NotNull(first);
        Assert.False(BridgeSingleInstance.TryAcquire(name, out var second));
        Assert.Null(second);

        first.Dispose();
        Assert.True(BridgeSingleInstance.TryAcquire(name, out var third));
        third!.Dispose();
    }
}
