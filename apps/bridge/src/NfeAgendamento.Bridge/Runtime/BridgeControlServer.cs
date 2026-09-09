using System.IO.Pipes;
using Microsoft.Extensions.Hosting;

namespace NfeAgendamento.Bridge.Runtime;

public sealed class BridgeControlServer : BackgroundService
{
    private readonly BridgeControlState _state;
    private readonly BridgeControlRequestHandler _handler;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly Func<DateTimeOffset> _clock;

    public BridgeControlServer(
        BridgeControlState state,
        BridgeControlRequestHandler handler,
        IHostApplicationLifetime lifetime)
        : this(state, handler, lifetime, () => DateTimeOffset.UtcNow)
    {
    }

    internal BridgeControlServer(
        BridgeControlState state,
        BridgeControlRequestHandler handler,
        IHostApplicationLifetime lifetime,
        Func<DateTimeOffset> clock)
    {
        _state = state ?? throw new ArgumentNullException(nameof(state));
        _handler = handler ?? throw new ArgumentNullException(nameof(handler));
        _lifetime = lifetime ?? throw new ArgumentNullException(nameof(lifetime));
        _clock = clock ?? throw new ArgumentNullException(nameof(clock));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var watchdog = WatchLeaseAsync(stoppingToken);
        try
        {
            await AcceptLoopAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
        finally
        {
            try
            {
                await watchdog;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
            }
        }
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            await using var server = new NamedPipeServerStream(
                BridgeControlConstants.PipeName,
                PipeDirection.InOut,
                maxNumberOfServerInstances: 1,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);

            try
            {
                await server.WaitForConnectionAsync(cancellationToken);
                var request = await BridgeControlProtocol.ReadRequestAsync(server, cancellationToken);
                var result = _handler.Handle(request);
                await BridgeControlProtocol.WriteResponseAsync(server, result.Response, cancellationToken);

                if (result.StopApplication)
                {
                    _lifetime.StopApplication();
                    return;
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception) when (
                exception is IOException or InvalidDataException or UnauthorizedAccessException)
            {
                // Uma sessão de controle inválida não derruba o Bridge; a próxima conexão começa limpa.
            }
        }
    }

    private async Task WatchLeaseAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(BridgeControlConstants.WatchdogInterval);
        while (await timer.WaitForNextTickAsync(cancellationToken))
        {
            if (!_state.ShouldStop(_clock()))
                continue;

            _lifetime.StopApplication();
            return;
        }
    }
}
