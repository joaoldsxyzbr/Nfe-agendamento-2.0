using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PersistentPortalClientTests
{
    private const string Key = "42260812345678000123550010000012341000012342";

    [Fact]
    public async Task Sequential_operations_reuse_the_same_healthy_session()
    {
        var session = new ScriptedSession(
            Envelope(PortalIpcMessageType.Completed, "op-1", xml: "<nfeProc id='1'/>") ,
            Envelope(PortalIpcMessageType.Completed, "op-2", xml: "<nfeProc id='2'/>")
        );
        var creates = 0;
        var client = new PersistentPortalClient(_ =>
        {
            creates += 1;
            return Task.FromResult<IPortalIpcSession>(session);
        });

        var first = await client.OpenAsync(Request("op-1"), TestContext.Current.CancellationToken);
        var second = await client.OpenAsync(Request("op-2"), TestContext.Current.CancellationToken);

        Assert.Equal(PortalLaunchOutcome.Completed, first.Outcome);
        Assert.Equal(PortalLaunchOutcome.Completed, second.Outcome);
        Assert.Equal(1, creates);
        Assert.Equal(2, session.Sent.Count);
        Assert.All(session.Sent, item => Assert.Equal(PortalIpcMessageType.StartOperation, item.Type));
    }

    [Fact]
    public async Task Concurrent_operation_is_rejected_instead_of_being_queued()
    {
        var firstEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseFirst = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var session = new BlockingSession(firstEntered, releaseFirst);
        var client = new PersistentPortalClient(_ => Task.FromResult<IPortalIpcSession>(session));

        var firstTask = client.OpenAsync(Request("op-1"), TestContext.Current.CancellationToken);
        await firstEntered.Task.WaitAsync(TestContext.Current.CancellationToken);

        var second = await client.OpenAsync(Request("op-2"), TestContext.Current.CancellationToken);

        Assert.Equal(PortalLaunchOutcome.Failed, second.Outcome);
        Assert.Contains("andamento", second.Message ?? string.Empty, StringComparison.OrdinalIgnoreCase);
        Assert.Single(session.Sent);

        releaseFirst.SetResult();
        var first = await firstTask;
        Assert.Equal(PortalLaunchOutcome.Completed, first.Outcome);
    }

    [Fact]
    public async Task Cancellation_is_sent_to_helper_and_the_healthy_session_is_reused()
    {
        var receiveEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var session = new CancellationAwareSession(receiveEntered);
        var creates = 0;
        var client = new PersistentPortalClient(_ =>
        {
            creates += 1;
            return Task.FromResult<IPortalIpcSession>(session);
        });
        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(TestContext.Current.CancellationToken);

        var firstTask = client.OpenAsync(Request("op-1"), cancellation.Token);
        await receiveEntered.Task.WaitAsync(TestContext.Current.CancellationToken);
        cancellation.Cancel();

        var first = await firstTask;
        var second = await client.OpenAsync(Request("op-2"), TestContext.Current.CancellationToken);

        Assert.Equal(PortalLaunchOutcome.Cancelled, first.Outcome);
        Assert.Equal(PortalLaunchOutcome.Completed, second.Outcome);
        Assert.Equal(1, creates);
        Assert.Collection(
            session.Sent,
            message => Assert.Equal(PortalIpcMessageType.StartOperation, message.Type),
            message =>
            {
                Assert.Equal(PortalIpcMessageType.CancelOperation, message.Type);
                Assert.Equal("op-1", message.OperationId);
            },
            message => Assert.Equal(PortalIpcMessageType.StartOperation, message.Type));
    }

    [Fact]
    public async Task Broken_session_fails_current_operation_and_next_operation_reconnects()
    {
        var broken = new ThrowingSession();
        var recovered = new ScriptedSession(
            Envelope(PortalIpcMessageType.Completed, "op-2", xml: "<nfeProc />")
        );
        var sessions = new Queue<IPortalIpcSession>([broken, recovered]);
        var creates = 0;
        var client = new PersistentPortalClient(_ =>
        {
            creates += 1;
            return Task.FromResult(sessions.Dequeue());
        });

        var first = await client.OpenAsync(Request("op-1"), TestContext.Current.CancellationToken);
        var second = await client.OpenAsync(Request("op-2"), TestContext.Current.CancellationToken);

        Assert.Equal(PortalLaunchOutcome.Failed, first.Outcome);
        Assert.Equal(PortalLaunchOutcome.Completed, second.Outcome);
        Assert.Equal(2, creates);
    }

    [Fact]
    public async Task Mismatched_operation_id_fails_closed_and_discards_session()
    {
        var bad = new ScriptedSession(
            Envelope(PortalIpcMessageType.Completed, "other-op", xml: "<nfeProc />")
        );
        var recovered = new ScriptedSession(
            Envelope(PortalIpcMessageType.Completed, "op-2", xml: "<nfeProc />")
        );
        var sessions = new Queue<IPortalIpcSession>([bad, recovered]);
        var creates = 0;
        var client = new PersistentPortalClient(_ =>
        {
            creates += 1;
            return Task.FromResult(sessions.Dequeue());
        });

        var first = await client.OpenAsync(Request("op-1"), TestContext.Current.CancellationToken);
        var second = await client.OpenAsync(Request("op-2"), TestContext.Current.CancellationToken);

        Assert.Equal(PortalLaunchOutcome.Failed, first.Outcome);
        Assert.Equal(PortalLaunchOutcome.Completed, second.Outcome);
        Assert.Equal(2, creates);
    }

    private static PortalLaunchRequest Request(string operationId) => new(operationId, Key, "ABC123");

    private static PortalIpcEnvelope Envelope(string type, string operationId, string? xml = null, string? message = null) =>
        new(type, operationId, Xml: xml, Message: message);

    private sealed class ScriptedSession(params PortalIpcEnvelope[] responses) : IPortalIpcSession
    {
        private readonly Queue<PortalIpcEnvelope> _responses = new(responses);
        public List<PortalIpcEnvelope> Sent { get; } = [];

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken)
        {
            Sent.Add(message);
            return Task.CompletedTask;
        }

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) =>
            Task.FromResult(_responses.Dequeue());

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class BlockingSession(
        TaskCompletionSource entered,
        TaskCompletionSource release) : IPortalIpcSession
    {
        public List<PortalIpcEnvelope> Sent { get; } = [];

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken)
        {
            Sent.Add(message);
            return Task.CompletedTask;
        }

        public async Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken)
        {
            entered.TrySetResult();
            await release.Task.WaitAsync(cancellationToken);
            return Envelope(PortalIpcMessageType.Completed, "op-1", xml: "<nfeProc />");
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class CancellationAwareSession(TaskCompletionSource firstReceiveEntered) : IPortalIpcSession
    {
        private int _receiveCount;
        public List<PortalIpcEnvelope> Sent { get; } = [];

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken)
        {
            Sent.Add(message);
            return Task.CompletedTask;
        }

        public async Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken)
        {
            var receive = Interlocked.Increment(ref _receiveCount);
            if (receive == 1)
            {
                firstReceiveEntered.TrySetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
                throw new InvalidOperationException("unreachable");
            }

            if (receive == 2)
                return Envelope(PortalIpcMessageType.Cancelled, "op-1", message: "cancelada");

            return Envelope(PortalIpcMessageType.Completed, "op-2", xml: "<nfeProc />");
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class ThrowingSession : IPortalIpcSession
    {
        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) =>
            Task.FromException<PortalIpcEnvelope>(new IOException("pipe disconnected"));

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
