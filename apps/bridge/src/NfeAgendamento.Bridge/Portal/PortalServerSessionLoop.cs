namespace NfeAgendamento.Bridge.Portal;

public interface IPortalServerOperationRunner
{
    Task<PortalLaunchResult> RunAsync(PortalLaunchRequest request, CancellationToken cancellationToken);
}

public sealed class PortalServerSessionLoop
{
    private readonly IPortalServerOperationRunner _runner;

    public PortalServerSessionLoop(IPortalServerOperationRunner runner)
    {
        _runner = runner ?? throw new ArgumentNullException(nameof(runner));
    }

    public async Task RunAsync(IPortalIpcSession session, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);

        await session.SendAsync(new PortalIpcEnvelope(PortalIpcMessageType.Ready), cancellationToken);

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var message = await session.ReceiveAsync(cancellationToken);

            if (string.Equals(message.Type, PortalIpcMessageType.Shutdown, StringComparison.Ordinal))
                return;

            if (!string.Equals(message.Type, PortalIpcMessageType.StartOperation, StringComparison.Ordinal))
                throw new InvalidDataException("O Bridge enviou uma mensagem IPC inesperada ao Portal.");

            if (string.IsNullOrWhiteSpace(message.OperationId) ||
                string.IsNullOrWhiteSpace(message.AccessKey) ||
                string.IsNullOrWhiteSpace(message.CertificateThumbprint))
            {
                await session.SendAsync(
                    new PortalIpcEnvelope(
                        PortalIpcMessageType.Failed,
                        message.OperationId,
                        Message: "Solicitação IPC do Portal inválida."),
                    cancellationToken);
                continue;
            }

            var request = new PortalLaunchRequest(
                message.OperationId,
                message.AccessKey,
                message.CertificateThumbprint);

            await session.SendAsync(
                new PortalIpcEnvelope(
                    PortalIpcMessageType.WaitingForUser,
                    request.OperationId,
                    Message: "Portal aberto. Resolva o hCaptcha manualmente."),
                cancellationToken);

            PortalLaunchResult result;
            try
            {
                result = await _runner.RunAsync(request, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception) when (
                exception is InvalidDataException
                or IOException
                or UnauthorizedAccessException
                or InvalidOperationException)
            {
                result = PortalLaunchResult.Failed(exception.Message);
            }

            var response = result.Outcome switch
            {
                PortalLaunchOutcome.Completed => new PortalIpcEnvelope(
                    PortalIpcMessageType.Completed,
                    request.OperationId,
                    Xml: result.Xml,
                    Message: result.Message),
                PortalLaunchOutcome.Cancelled => new PortalIpcEnvelope(
                    PortalIpcMessageType.Cancelled,
                    request.OperationId,
                    Message: result.Message),
                _ => new PortalIpcEnvelope(
                    PortalIpcMessageType.Failed,
                    request.OperationId,
                    Message: result.Message),
            };

            await session.SendAsync(response, cancellationToken);
        }
    }
}
