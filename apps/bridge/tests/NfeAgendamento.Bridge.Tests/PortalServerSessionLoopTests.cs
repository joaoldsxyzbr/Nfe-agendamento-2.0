using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalServerSessionLoopTests
{
    private const string Key = "42260812345678000123550010000012341000012342";

    [Fact]
    public async Task Session_sends_ready_runs_operations_and_stays_alive_until_shutdown()
    {
        var session = new ScriptedSession(
            new PortalIpcEnvelope(PortalIpcMessageType.StartOperation, "op-1", Key, "CERT"),
            new PortalIpcEnvelope(PortalIpcMessageType.StartOperation, "op-2", Key, "CERT"),
            new PortalIpcEnvelope(PortalIpcMessageType.Shutdown));
        var runner = new ScriptedRunner(
            PortalLaunchResult.Completed("<nfeProc id='1'/>") ,
            PortalLaunchResult.Cancelled("fechado"));
        var loop = new PortalServerSessionLoop(runner);

        await loop.RunAsync(session, TestContext.Current.CancellationToken);

        Assert.Equal(5, session.Sent.Count);
        Assert.Equal(PortalIpcMessageType.Ready, session.Sent[0].Type);
        Assert.Equal(PortalIpcMessageType.WaitingForUser, session.Sent[1].Type);
        Assert.Equal(PortalIpcMessageType.Completed, session.Sent[2].Type);
        Assert.Equal("<nfeProc id='1'/>", session.Sent[2].Xml);
        Assert.Equal(PortalIpcMessageType.WaitingForUser, session.Sent[3].Type);
        Assert.Equal(PortalIpcMessageType.Cancelled, session.Sent[4].Type);
        Assert.Equal(2, runner.Requests.Count);
    }

    [Fact]
    public async Task Cancel_message_cancels_the_active_runner_and_keeps_session_usable()
    {
        var session = new ScriptedSession(
            new PortalIpcEnvelope(PortalIpcMessageType.StartOperation, "op-1", Key, "CERT"),
            new PortalIpcEnvelope(PortalIpcMessageType.CancelOperation, "op-1"),
            new PortalIpcEnvelope(PortalIpcMessageType.StartOperation, "op-2", Key, "CERT"),
            new PortalIpcEnvelope(PortalIpcMessageType.Shutdown));
        var runner = new CancelThenCompleteRunner();
        var loop = new PortalServerSessionLoop(runner);

        await loop.RunAsync(session, TestContext.Current.CancellationToken);

        Assert.Collection(
            session.Sent,
            message => Assert.Equal(PortalIpcMessageType.Ready, message.Type),
            message => Assert.Equal(PortalIpcMessageType.WaitingForUser, message.Type),
            message =>
            {
                Assert.Equal(PortalIpcMessageType.Cancelled, message.Type);
                Assert.Equal("op-1", message.OperationId);
            },
            message => Assert.Equal(PortalIpcMessageType.WaitingForUser, message.Type),
            message =>
            {
                Assert.Equal(PortalIpcMessageType.Completed, message.Type);
                Assert.Equal("op-2", message.OperationId);
            });
        Assert.True(runner.FirstCancellationObserved);
        Assert.Equal(2, runner.Requests.Count);
    }

    [Fact]
    public async Task Invalid_start_message_fails_closed_without_invoking_runner()
    {
        var session = new ScriptedSession(
            new PortalIpcEnvelope(PortalIpcMessageType.StartOperation, "op-1", AccessKey: null, CertificateThumbprint: "CERT"),
            new PortalIpcEnvelope(PortalIpcMessageType.Shutdown));
        var runner = new ScriptedRunner();
        var loop = new PortalServerSessionLoop(runner);

        await loop.RunAsync(session, TestContext.Current.CancellationToken);

        Assert.Empty(runner.Requests);
        Assert.Equal(PortalIpcMessageType.Ready, session.Sent[0].Type);
        Assert.Equal(PortalIpcMessageType.Failed, session.Sent[1].Type);
        Assert.Equal("op-1", session.Sent[1].OperationId);
    }

    [Fact]
    public async Task Unexpected_message_type_terminates_session_as_invalid_data()
    {
        var session = new ScriptedSession(new PortalIpcEnvelope(PortalIpcMessageType.Completed, "op-x", Xml: "x"));
        var loop = new PortalServerSessionLoop(new ScriptedRunner());

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            loop.RunAsync(session, TestContext.Current.CancellationToken));
    }

    private sealed class ScriptedSession(params PortalIpcEnvelope[] incoming) : IPortalIpcSession
    {
        private readonly Queue<PortalIpcEnvelope> _incoming = new(incoming);
        public List<PortalIpcEnvelope> Sent { get; } = [];

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken)
        {
            Sent.Add(message);
            return Task.CompletedTask;
        }

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) =>
            Task.FromResult(_incoming.Dequeue());

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class ScriptedRunner(params PortalLaunchResult[] results) : IPortalServerOperationRunner
    {
        private readonly Queue<PortalLaunchResult> _results = new(results);
        public List<PortalLaunchRequest> Requests { get; } = [];

        public Task<PortalLaunchResult> RunAsync(PortalLaunchRequest request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(_results.Count > 0
                ? _results.Dequeue()
                : PortalLaunchResult.Failed("sem resultado"));
        }
    }

    private sealed class CancelThenCompleteRunner : IPortalServerOperationRunner
    {
        public List<PortalLaunchRequest> Requests { get; } = [];
        public bool FirstCancellationObserved { get; private set; }

        public async Task<PortalLaunchResult> RunAsync(
            PortalLaunchRequest request,
            CancellationToken cancellationToken)
        {
            Requests.Add(request);
            if (request.OperationId == "op-2")
                return PortalLaunchResult.Completed("<nfeProc />");

            try
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
                return PortalLaunchResult.Failed("cancelamento não observado");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                FirstCancellationObserved = true;
                return PortalLaunchResult.Cancelled("cancelada");
            }
        }
    }
}
