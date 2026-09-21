using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class NfeLookupOperationRegistryTests
{
    private const string KeyA = "35260812345678000195550010000000011000000018";
    private const string KeyB = "42260812345678000123550010000012341000012342";

    [Fact]
    public async Task Same_request_id_and_key_reuses_terminal_result()
    {
        var calls = 0;
        var registry = new NfeLookupOperationRegistry();
        var expected = Result("137");

        var first = await registry.ExecuteAsync("req-1", KeyA, () =>
        {
            calls += 1;
            return Task.FromResult(expected);
        });
        var second = await registry.ExecuteAsync("req-1", KeyA, () =>
        {
            calls += 1;
            return Task.FromResult(Result("999"));
        });

        Assert.Same(expected, first);
        Assert.Same(expected, second);
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Same_request_id_with_different_key_is_conflict()
    {
        var registry = new NfeLookupOperationRegistry();
        await registry.ExecuteAsync("req-1", KeyA, () => Task.FromResult(Result("137")));

        await Assert.ThrowsAsync<NfeLookupRequestConflictException>(() =>
            registry.ExecuteAsync("req-1", KeyB, () => Task.FromResult(Result("138"))));
    }

    [Fact]
    public async Task Different_request_ids_for_same_inflight_key_share_one_factory()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;
        var registry = new NfeLookupOperationRegistry();

        Task<LookupResult> Factory()
        {
            calls += 1;
            entered.TrySetResult();
            return CompleteAsync();
        }

        async Task<LookupResult> CompleteAsync()
        {
            await release.Task;
            return Result("137");
        }

        var first = registry.ExecuteAsync("req-1", KeyA, Factory);
        await entered.Task.WaitAsync(TestContext.Current.CancellationToken);
        var second = registry.ExecuteAsync("req-2", KeyA, Factory);

        Assert.Equal(1, calls);
        release.SetResult();

        var results = await Task.WhenAll(first, second);
        Assert.Same(results[0], results[1]);
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Expired_terminal_request_can_execute_again()
    {
        var now = new DateTimeOffset(2026, 9, 21, 12, 0, 0, TimeSpan.Zero);
        var calls = 0;
        var registry = new NfeLookupOperationRegistry(
            clock: () => now,
            terminalTtl: TimeSpan.FromMinutes(2));

        await registry.ExecuteAsync("req-1", KeyA, () =>
        {
            calls += 1;
            return Task.FromResult(Result("137"));
        });

        now = now.AddMinutes(2).AddMilliseconds(1);

        await registry.ExecuteAsync("req-1", KeyA, () =>
        {
            calls += 1;
            return Task.FromResult(Result("138"));
        });

        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Registry_never_runs_two_factories_simultaneously_for_same_key()
    {
        var active = 0;
        var maxActive = 0;
        var calls = 0;
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var registry = new NfeLookupOperationRegistry();

        async Task<LookupResult> Factory()
        {
            calls += 1;
            var current = Interlocked.Increment(ref active);
            maxActive = Math.Max(maxActive, current);
            entered.TrySetResult();
            await release.Task;
            Interlocked.Decrement(ref active);
            return Result("137");
        }

        var tasks = Enumerable.Range(0, 8)
            .Select(index => registry.ExecuteAsync($"req-{index}", KeyA, Factory))
            .ToArray();

        await entered.Task.WaitAsync(TestContext.Current.CancellationToken);
        Assert.Equal(1, calls);
        release.SetResult();
        await Task.WhenAll(tasks);

        Assert.Equal(1, calls);
        Assert.Equal(1, maxActive);
    }

    private static LookupResult Result(string cStat) =>
        new(LookupCategories.FiscalStatus, null, cStat, "teste");
}
