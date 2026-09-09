namespace NfeAgendamento.Bridge.Portal;

public interface IPortalIpcSession : IAsyncDisposable
{
    Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken);
    Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken);
}

public sealed class PersistentPortalClient : IAsyncDisposable
{
    private readonly Func<CancellationToken, Task<IPortalIpcSession>> _sessionFactory;
    private readonly SemaphoreSlim _sessionGate = new(1, 1);
    private IPortalIpcSession? _session;
    private int _busy;

    public PersistentPortalClient(Func<CancellationToken, Task<IPortalIpcSession>> sessionFactory)
    {
        _sessionFactory = sessionFactory ?? throw new ArgumentNullException(nameof(sessionFactory));
    }

    public async Task<PortalLaunchResult> OpenAsync(
        PortalLaunchRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (Interlocked.CompareExchange(ref _busy, 1, 0) != 0)
            return PortalLaunchResult.Failed("Já existe uma consulta pelo Portal em andamento neste computador.");

        try
        {
            var session = await GetOrCreateSessionAsync(cancellationToken);
            await session.SendAsync(
                new PortalIpcEnvelope(
                    PortalIpcMessageType.StartOperation,
                    request.OperationId,
                    request.AccessKey,
                    request.CertificateThumbprint),
                cancellationToken);

            while (true)
            {
                var message = await session.ReceiveAsync(cancellationToken);
                if (!string.Equals(message.OperationId, request.OperationId, StringComparison.Ordinal))
                {
                    await ResetSessionAsync();
                    return PortalLaunchResult.Failed("O helper do Portal retornou uma operação diferente da solicitada.");
                }

                switch (message.Type)
                {
                    case PortalIpcMessageType.WaitingForUser:
                    case PortalIpcMessageType.Heartbeat:
                        continue;
                    case PortalIpcMessageType.Completed:
                        if (string.IsNullOrWhiteSpace(message.Xml))
                        {
                            await ResetSessionAsync();
                            return PortalLaunchResult.Failed("O helper do Portal concluiu sem retornar XML.");
                        }
                        return PortalLaunchResult.Completed(message.Xml);
                    case PortalIpcMessageType.Cancelled:
                        return PortalLaunchResult.Cancelled(message.Message ?? "Portal fechado pelo usuário.");
                    case PortalIpcMessageType.Failed:
                        return PortalLaunchResult.Failed(message.Message ?? "Não foi possível concluir a consulta pelo Portal.");
                    default:
                        await ResetSessionAsync();
                        return PortalLaunchResult.Failed("O helper do Portal retornou uma mensagem inesperada.");
                }
            }
        }
        catch (OperationCanceledException)
        {
            await ResetSessionAsync();
            throw;
        }
        catch (Exception exception) when (
            exception is IOException
            or InvalidDataException
            or ObjectDisposedException
            or InvalidOperationException)
        {
            await ResetSessionAsync();
            return PortalLaunchResult.Failed("A conexão local com o Portal foi interrompida. Tente novamente na próxima consulta.");
        }
        finally
        {
            Volatile.Write(ref _busy, 0);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await ResetSessionAsync();
        _sessionGate.Dispose();
    }

    private async Task<IPortalIpcSession> GetOrCreateSessionAsync(CancellationToken cancellationToken)
    {
        if (_session is not null) return _session;

        await _sessionGate.WaitAsync(cancellationToken);
        try
        {
            if (_session is null)
                _session = await _sessionFactory(cancellationToken);
            return _session;
        }
        finally
        {
            _sessionGate.Release();
        }
    }

    private async Task ResetSessionAsync()
    {
        await _sessionGate.WaitAsync();
        try
        {
            var session = _session;
            _session = null;
            if (session is not null)
            {
                try
                {
                    await session.DisposeAsync();
                }
                catch (Exception exception) when (exception is IOException or ObjectDisposedException or InvalidOperationException)
                {
                }
            }
        }
        finally
        {
            _sessionGate.Release();
        }
    }
}
