using System.Collections.Concurrent;
using NfeAgendamento.Bridge.Fiscal;

namespace NfeAgendamento.Bridge.Portal;

public sealed class PortalFallbackService
{
    private static readonly TimeSpan DefaultTerminalRetention = TimeSpan.FromMinutes(2);

    private readonly IPortalWindowLauncher _launcher;
    private readonly Func<string?> _selectedThumbprint;
    private readonly TimeSpan _terminalRetention;
    private readonly ConcurrentDictionary<string, PortalOperationStatus> _operations = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _operationCancellation = new(StringComparer.Ordinal);

    public PortalFallbackService(
        IPortalWindowLauncher launcher,
        Func<string?> selectedThumbprint,
        TimeSpan? terminalRetention = null)
    {
        _launcher = launcher ?? throw new ArgumentNullException(nameof(launcher));
        _selectedThumbprint = selectedThumbprint ?? throw new ArgumentNullException(nameof(selectedThumbprint));
        _terminalRetention = terminalRetention ?? DefaultTerminalRetention;
        if (_terminalRetention <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(terminalRetention), "A retenção terminal do Portal deve ser positiva.");
    }

    public bool IsAvailable => _launcher.IsAvailable && !string.IsNullOrWhiteSpace(_selectedThumbprint());

    public Task<string> StartAsync(string accessKey, CancellationToken cancellationToken = default)
    {
        if (!AccessKey.TryParse(accessKey, out _))
            throw new ArgumentException("Chave NF-e inválida.", nameof(accessKey));

        var thumbprint = _selectedThumbprint();
        if (string.IsNullOrWhiteSpace(thumbprint))
            throw new InvalidOperationException("Selecione um certificado A1 antes de abrir o Portal da NF-e.");
        if (!_launcher.IsAvailable)
            throw new InvalidOperationException("O fallback Portal/WebView2 não está disponível neste computador.");

        cancellationToken.ThrowIfCancellationRequested();

        var operationId = Guid.NewGuid().ToString("N");
        var operationCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        if (!_operationCancellation.TryAdd(operationId, operationCancellation))
        {
            operationCancellation.Dispose();
            throw new InvalidOperationException("Não foi possível registrar a operação do Portal.");
        }

        _operations[operationId] = new PortalOperationStatus(
            operationId,
            PortalOperationStates.WaitingForUser,
            "Portal aberto neste computador. Resolva o hCaptcha manualmente e solicite o XML.",
            null);

        _ = RunOperationAsync(
            new PortalLaunchRequest(operationId, accessKey, thumbprint),
            operationCancellation.Token);
        return Task.FromResult(operationId);
    }

    public PortalOperationStatus? GetStatus(string operationId)
    {
        if (string.IsNullOrWhiteSpace(operationId)) return null;
        return _operations.TryGetValue(operationId, out var status) ? status : null;
    }

    public bool Cancel(string operationId)
    {
        if (string.IsNullOrWhiteSpace(operationId) ||
            !_operations.TryGetValue(operationId, out var status) ||
            IsTerminal(status.State) ||
            !_operationCancellation.TryGetValue(operationId, out var cancellation))
        {
            return false;
        }

        try
        {
            cancellation.Cancel();
        }
        catch (ObjectDisposedException)
        {
            return false;
        }

        Set(
            operationId,
            PortalOperationStates.Cancelled,
            "Consulta pelo Portal cancelada.",
            null);
        return true;
    }

    private async Task RunOperationAsync(PortalLaunchRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var result = await _launcher.OpenAsync(request, cancellationToken);
            switch (result.Outcome)
            {
                case PortalLaunchOutcome.Completed:
                    var xml = NfePortalXmlValidator.Validate(
                        result.Xml ?? throw new InvalidDataException("O Portal não retornou XML."),
                        request.AccessKey);
                    Set(request.OperationId, PortalOperationStates.Completed, "XML recebido e validado pelo Bridge.", xml);
                    break;
                case PortalLaunchOutcome.Cancelled:
                    Set(request.OperationId, PortalOperationStates.Cancelled, result.Message ?? "Portal fechado pelo usuário.", null);
                    break;
                default:
                    Set(request.OperationId, PortalOperationStates.Failed, result.Message ?? "Não foi possível concluir a consulta pelo Portal.", null);
                    break;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            Set(request.OperationId, PortalOperationStates.Cancelled, "Consulta pelo Portal cancelada.", null);
        }
        catch (Exception exception) when (exception is InvalidDataException or IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            Set(request.OperationId, PortalOperationStates.Failed, exception.Message, null);
        }
        catch (Exception)
        {
            Set(request.OperationId, PortalOperationStates.Failed, "Falha inesperada ao usar o Portal da NF-e.", null);
        }
    }

    private void Set(string operationId, string state, string? message, string? xml)
    {
        var next = new PortalOperationStatus(operationId, state, message, xml);

        while (true)
        {
            if (!_operations.TryGetValue(operationId, out var current))
                return;
            if (IsTerminal(current.State))
                return;
            if (_operations.TryUpdate(operationId, next, current))
                break;
        }

        if (!IsTerminal(state))
            return;

        if (_operationCancellation.TryRemove(operationId, out var cancellation))
            cancellation.Dispose();
        _ = ExpireTerminalAsync(operationId);
    }

    private async Task ExpireTerminalAsync(string operationId)
    {
        await Task.Delay(_terminalRetention);
        _operations.TryRemove(operationId, out _);
    }

    private static bool IsTerminal(string state) =>
        state is PortalOperationStates.Completed or PortalOperationStates.Failed or PortalOperationStates.Cancelled;
}
