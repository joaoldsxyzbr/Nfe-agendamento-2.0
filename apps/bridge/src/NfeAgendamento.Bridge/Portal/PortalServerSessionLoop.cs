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

    public async Task<bool> RunAsync(IPortalIpcSession session, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);

        await session.SendAsync(new PortalIpcEnvelope(PortalIpcMessageType.Ready), cancellationToken);

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var message = await session.ReceiveAsync(cancellationToken);

            if (string.Equals(message.Type, PortalIpcMessageType.Shutdown, StringComparison.Ordinal))
                return true;

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

            var operation = await RunOperationAsync(session, request, cancellationToken);
            if (operation.ShutdownRequested)
                return true;

            await session.SendAsync(ToEnvelope(request.OperationId, operation.Result), cancellationToken);
        }
    }

    private async Task<OperationExecutionResult> RunOperationAsync(
        IPortalIpcSession session,
        PortalLaunchRequest request,
        CancellationToken sessionCancellationToken)
    {
        using var operationCancellation = CancellationTokenSource.CreateLinkedTokenSource(sessionCancellationToken);
        var runnerTask = RunRunnerAsync(request, operationCancellation.Token);

        try
        {
            while (!runnerTask.IsCompleted)
            {
                using var receiveCancellation = CancellationTokenSource.CreateLinkedTokenSource(sessionCancellationToken);
                var receiveTask = session.ReceiveAsync(receiveCancellation.Token);
                var completed = await Task.WhenAny(runnerTask, receiveTask);

                if (ReferenceEquals(completed, runnerTask))
                {
                    receiveCancellation.Cancel();
                    try
                    {
                        await receiveTask;
                    }
                    catch (OperationCanceledException) when (receiveCancellation.IsCancellationRequested)
                    {
                    }
                    break;
                }

                PortalIpcEnvelope control;
                try
                {
                    control = await receiveTask;
                }
                catch
                {
                    operationCancellation.Cancel();
                    throw;
                }

                if (string.Equals(control.Type, PortalIpcMessageType.CancelOperation, StringComparison.Ordinal))
                {
                    if (!string.Equals(control.OperationId, request.OperationId, StringComparison.Ordinal))
                    {
                        operationCancellation.Cancel();
                        throw new InvalidDataException("O Bridge tentou cancelar uma operação Portal diferente da ativa.");
                    }

                    operationCancellation.Cancel();
                    await ObserveRunnerAfterCancellationAsync(runnerTask);
                    return new OperationExecutionResult(
                        PortalLaunchResult.Cancelled("Consulta pelo Portal cancelada."),
                        ShutdownRequested: false);
                }

                if (string.Equals(control.Type, PortalIpcMessageType.Shutdown, StringComparison.Ordinal))
                {
                    operationCancellation.Cancel();
                    await ObserveRunnerAfterCancellationAsync(runnerTask);
                    return new OperationExecutionResult(
                        PortalLaunchResult.Cancelled("Helper do Portal encerrado."),
                        ShutdownRequested: true);
                }

                operationCancellation.Cancel();
                throw new InvalidDataException("O Bridge enviou uma mensagem IPC inesperada durante a operação Portal.");
            }

            return new OperationExecutionResult(await runnerTask, ShutdownRequested: false);
        }
        catch
        {
            operationCancellation.Cancel();
            throw;
        }
    }

    private async Task<PortalLaunchResult> RunRunnerAsync(
        PortalLaunchRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return await _runner.RunAsync(request, cancellationToken);
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
            return PortalLaunchResult.Failed(exception.Message);
        }
    }

    private static async Task ObserveRunnerAfterCancellationAsync(Task<PortalLaunchResult> runnerTask)
    {
        try
        {
            await runnerTask;
        }
        catch (OperationCanceledException)
        {
        }
    }

    private static PortalIpcEnvelope ToEnvelope(string operationId, PortalLaunchResult result) =>
        result.Outcome switch
        {
            PortalLaunchOutcome.Completed => new PortalIpcEnvelope(
                PortalIpcMessageType.Completed,
                operationId,
                Xml: result.Xml,
                Message: result.Message),
            PortalLaunchOutcome.Cancelled => new PortalIpcEnvelope(
                PortalIpcMessageType.Cancelled,
                operationId,
                Message: result.Message),
            _ => new PortalIpcEnvelope(
                PortalIpcMessageType.Failed,
                operationId,
                Message: result.Message),
        };

    private sealed record OperationExecutionResult(
        PortalLaunchResult Result,
        bool ShutdownRequested);
}
