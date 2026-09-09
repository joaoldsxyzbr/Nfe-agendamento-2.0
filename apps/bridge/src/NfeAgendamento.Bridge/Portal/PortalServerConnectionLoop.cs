namespace NfeAgendamento.Bridge.Portal;

public sealed class PortalServerConnectionLoop
{
    private readonly Func<CancellationToken, Task<IPortalIpcSession>> _acceptSession;
    private readonly IPortalServerOperationRunner _runner;

    public PortalServerConnectionLoop(
        Func<CancellationToken, Task<IPortalIpcSession>> acceptSession,
        IPortalServerOperationRunner runner)
    {
        _acceptSession = acceptSession ?? throw new ArgumentNullException(nameof(acceptSession));
        _runner = runner ?? throw new ArgumentNullException(nameof(runner));
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            IPortalIpcSession? session = null;

            try
            {
                session = await _acceptSession(cancellationToken);
                var shutdownRequested = await new PortalServerSessionLoop(_runner)
                    .RunAsync(session, cancellationToken);
                if (shutdownRequested)
                    return;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception) when (
                exception is IOException
                or InvalidDataException
                or ObjectDisposedException)
            {
                // A sessão IPC caiu ou ficou inválida; o helper saudável aceita uma nova conexão.
            }
            finally
            {
                if (session is not null)
                {
                    try
                    {
                        await session.DisposeAsync();
                    }
                    catch (Exception exception) when (
                        exception is IOException
                        or ObjectDisposedException
                        or InvalidOperationException)
                    {
                    }
                }
            }
        }
    }
}
