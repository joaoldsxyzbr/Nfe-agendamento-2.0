using System.Diagnostics;
using System.IO.Pipes;
using NfeAgendamento.Bridge.Portal;

namespace NfeAgendamento.Portal;

internal sealed class PortalServer
{
    private static readonly TimeSpan OrphanGracePeriod = TimeSpan.FromSeconds(5);

    private readonly string _pipeName;
    private readonly int _parentProcessId;
    private readonly IPortalServerOperationRunner _runner;

    public PortalServer(string pipeName, int parentProcessId, IPortalServerOperationRunner runner)
    {
        if (string.IsNullOrWhiteSpace(pipeName)) throw new ArgumentException("Nome do pipe não informado.", nameof(pipeName));
        if (parentProcessId <= 0) throw new ArgumentOutOfRangeException(nameof(parentProcessId));
        _pipeName = pipeName;
        _parentProcessId = parentProcessId;
        _runner = runner ?? throw new ArgumentNullException(nameof(runner));
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var watchdog = WatchParentAsync(lifetime);

        try
        {
            var connections = new PortalServerConnectionLoop(AcceptSessionAsync, _runner);
            await connections.RunAsync(lifetime.Token);
        }
        finally
        {
            lifetime.Cancel();
            try
            {
                await watchdog;
            }
            catch (OperationCanceledException)
            {
            }
        }
    }

    private async Task<IPortalIpcSession> AcceptSessionAsync(CancellationToken cancellationToken)
    {
        var server = new NamedPipeServerStream(
            _pipeName,
            PipeDirection.InOut,
            maxNumberOfServerInstances: 1,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);

        try
        {
            await server.WaitForConnectionAsync(cancellationToken);
            return new PortalPipeSession(server);
        }
        catch
        {
            server.Dispose();
            throw;
        }
    }

    private async Task WatchParentAsync(CancellationTokenSource lifetime)
    {
        try
        {
            using var parent = Process.GetProcessById(_parentProcessId);
            await parent.WaitForExitAsync(lifetime.Token);
        }
        catch (ArgumentException)
        {
            // O Bridge já encerrou antes de o watchdog iniciar.
        }
        catch (InvalidOperationException)
        {
            // Processo já finalizado.
        }

        if (lifetime.IsCancellationRequested) return;
        await Task.Delay(OrphanGracePeriod, lifetime.Token);
        lifetime.Cancel();
    }

    private sealed class PortalPipeSession : IPortalIpcSession
    {
        private readonly Stream _stream;

        public PortalPipeSession(Stream stream) => _stream = stream;

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken) =>
            PortalIpcProtocol.WriteAsync(_stream, message, cancellationToken);

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) =>
            PortalIpcProtocol.ReadAsync(_stream, cancellationToken);

        public ValueTask DisposeAsync() => _stream.DisposeAsync();
    }
}
