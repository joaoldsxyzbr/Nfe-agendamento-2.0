namespace NfeAgendamento.Bridge.Portal;

public interface IPortalIpcSession : IAsyncDisposable
{
    Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken);
    Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken);
}
