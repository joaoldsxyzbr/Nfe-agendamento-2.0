using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalServerConnectionLoopTests
{
    [Fact]
    public async Task Disconnect_releases_the_session_and_accepts_a_new_connection_until_shutdown()
    {
        var first = new DisconnectingSession();
        var second = new ScriptedSession(new PortalIpcEnvelope(PortalIpcMessageType.Shutdown));
        var sessions = new Queue<IPortalIpcSession>([first, second]);
        var accepts = 0;
        var loop = new PortalServerConnectionLoop(
            _ =>
            {
                accepts += 1;
                return Task.FromResult(sessions.Dequeue());
            },
            new NeverRunRunner());

        await loop.RunAsync(TestContext.Current.CancellationToken);

        Assert.Equal(2, accepts);
        Assert.True(first.Disposed);
        Assert.True(second.Disposed);
    }

    private sealed class DisconnectingSession : IPortalIpcSession
    {
        public bool Disposed { get; private set; }

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) =>
            Task.FromException<PortalIpcEnvelope>(new IOException("pipe disconnected"));

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class ScriptedSession(PortalIpcEnvelope message) : IPortalIpcSession
    {
        public bool Disposed { get; private set; }

        public Task SendAsync(PortalIpcEnvelope envelope, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) => Task.FromResult(message);

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class NeverRunRunner : IPortalServerOperationRunner
    {
        public Task<PortalLaunchResult> RunAsync(PortalLaunchRequest request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("O runner não deve ser chamado neste cenário.");
    }
}
