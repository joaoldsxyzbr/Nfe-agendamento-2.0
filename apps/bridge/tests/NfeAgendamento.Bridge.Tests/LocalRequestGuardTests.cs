using NfeAgendamento.Bridge.Security;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class LocalRequestGuardTests
{
    [Theory]
    [InlineData("https://nfeagendamento.example", true)]
    [InlineData("https://evil.example", false)]
    [InlineData(null, false)]
    public void Origin_is_allowlisted(string? origin, bool expected)
    {
        var guard = new LocalRequestGuard(["https://nfeagendamento.example"]);

        Assert.Equal(expected, guard.IsAllowedOrigin(origin));
    }

    [Theory]
    [InlineData("127.0.0.1:17345", true)]
    [InlineData("localhost:17345", false)]
    [InlineData("192.168.0.10:17345", false)]
    public void Host_is_strictly_loopback(string host, bool expected)
    {
        var guard = new LocalRequestGuard(["https://nfeagendamento.example"]);

        Assert.Equal(expected, guard.IsAllowedHost(host));
    }
}
