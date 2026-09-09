namespace NfeAgendamento.Bridge.Portal;

public sealed class PersistentPortalClient : IAsyncDisposable
{
    private static readonly TimeSpan CancelAcknowledgementTimeout = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan DefaultFailureCooldown = TimeSpan.FromSeconds(2);

    private readonly Func<CancellationToken, Task<IPortalIpcSession>> _sessionFactory;
    private readonly Func<DateTimeOffset> _clock;
    private readonly TimeSpan _failureCooldown;
    private readonly SemaphoreSlim _sessionGate = new(1, 1);
    private IPortalIpcSession? _session;
    private DateTimeOffset? _cooldownUntil;
    private int _busy;

    public PersistentPortalClient(
        Func<CancellationToken, Task<IPortalIpcSession>> sessionFactory,
        Func<DateTimeOffset>? clock = null,
        TimeSpan? failureCooldown = null)
    {
        _sessionFactory = sessionFactory ?? throw new ArgumentNullException(nameof(sessionFactory));
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _failureCooldown = failureCooldown ?? DefaultFailureCooldown;
        if (_failureCooldown <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(failureCooldown));
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
            if (IsCoolingDown())
                return PortalLaunchResult.Failed("A conexão local com o Portal está em recuperação; aguarde alguns segundos e tente novamente.");

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
                    return await FailFatalSessionAsync("O helper do Portal retornou uma operação diferente da solicitada.");

                switch (message.Type)
                {
                    case PortalIpcMessageType.WaitingForUser:
                    case PortalIpcMessageType.Heartbeat:
                        continue;
                    case PortalIpcMessageType.Completed:
                        if (string.IsNullOrWhiteSpace(message.Xml))
                            return await FailFatalSessionAsync("O helper do Portal concluiu sem retornar XML.");
                        ClearCooldown();
                        return PortalLaunchResult.Completed(message.Xml);
                    case PortalIpcMessageType.Cancelled:
                        ClearCooldown();
                        return PortalLaunchResult.Cancelled(message.Message ?? "Portal fechado pelo usuário.");
                    case PortalIpcMessageType.Failed:
                        ClearCooldown();
                        return PortalLaunchResult.Failed(message.Message ?? "Não foi possível concluir a consulta pelo Portal.");
                    default:
                        return await FailFatalSessionAsync("O helper do Portal retornou uma mensagem inesperada.");
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            if (!await TryCancelOperationAsync(request.OperationId))
            {
                EnterCooldown();
                await ResetSessionAsync();
            }

            return PortalLaunchResult.Cancelled("Consulta pelo Portal cancelada.");
        }
        catch (Exception exception) when (
            exception is IOException
            or InvalidDataException
            or ObjectDisposedException
            or InvalidOperationException)
        {
            EnterCooldown();
            await ResetSessionAsync();
            return PortalLaunchResult.Failed("A conexão local com o Portal foi interrompida. Aguarde alguns segundos antes de tentar novamente.");
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

    private bool IsCoolingDown()
    {
        var cooldownUntil = _cooldownUntil;
        if (cooldownUntil is null)
            return false;

        if (_clock() < cooldownUntil.Value)
            return true;

        _cooldownUntil = null;
        return false;
    }

    private void EnterCooldown() => _cooldownUntil = _clock().Add(_failureCooldown);

    private void ClearCooldown() => _cooldownUntil = null;

    private async Task<PortalLaunchResult> FailFatalSessionAsync(string message)
    {
        EnterCooldown();
        await ResetSessionAsync();
        return PortalLaunchResult.Failed(message);
    }

    private async Task<bool> TryCancelOperationAsync(string operationId)
    {
        var session = _session;
        if (session is null)
            return false;

        using var timeout = new CancellationTokenSource(CancelAcknowledgementTimeout);
        try
        {
            await session.SendAsync(
                new PortalIpcEnvelope(PortalIpcMessageType.CancelOperation, operationId),
                timeout.Token);
            var acknowledgement = await session.ReceiveAsync(timeout.Token);
            return string.Equals(acknowledgement.OperationId, operationId, StringComparison.Ordinal) &&
                string.Equals(acknowledgement.Type, PortalIpcMessageType.Cancelled, StringComparison.Ordinal);
        }
        catch (Exception exception) when (
            exception is IOException
            or InvalidDataException
            or ObjectDisposedException
            or InvalidOperationException
            or OperationCanceledException)
        {
            return false;
        }
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
