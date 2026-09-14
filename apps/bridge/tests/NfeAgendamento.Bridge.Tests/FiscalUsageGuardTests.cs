using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class FiscalUsageGuardTests
{
    private const string Cnpj = "12345678000195";

    [Fact]
    public void Twenty_local_attempts_activate_protection_without_storing_cnpj()
    {
        var path = TemporaryPath();
        var now = new DateTimeOffset(2026, 9, 14, 18, 0, 0, TimeSpan.Zero);
        try
        {
            var guard = new FiscalUsageGuard(path, () => now);
            for (var index = 0; index < FiscalUsageGuard.MaxDirectAttemptsPerHour; index++)
            {
                Assert.True(guard.Check(Cnpj).AllowDirectLookup);
                guard.RecordAttempt(Cnpj);
            }

            var decision = guard.Check(Cnpj);

            Assert.False(decision.AllowDirectLookup);
            Assert.Equal(now.AddHours(1), decision.BlockedUntilUtc);
            Assert.DoesNotContain(Cnpj, File.ReadAllText(path));
        }
        finally
        {
            DeleteIfExists(path);
        }
    }

    [Fact]
    public void Cooldown_survives_guard_restart_and_expires_after_one_hour()
    {
        var path = TemporaryPath();
        var now = new DateTimeOffset(2026, 9, 14, 18, 0, 0, TimeSpan.Zero);
        try
        {
            var first = new FiscalUsageGuard(path, () => now);
            first.Block(Cnpj);

            var restarted = new FiscalUsageGuard(path, () => now);
            Assert.False(restarted.Check(Cnpj).AllowDirectLookup);

            now = now.AddHours(1).AddSeconds(1);
            Assert.True(restarted.Check(Cnpj).AllowDirectLookup);
        }
        finally
        {
            DeleteIfExists(path);
        }
    }

    private static string TemporaryPath() => Path.Combine(
        Path.GetTempPath(),
        $"nfe-agendamento-fiscal-usage-{Guid.NewGuid():N}.json");

    private static void DeleteIfExists(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }
}
