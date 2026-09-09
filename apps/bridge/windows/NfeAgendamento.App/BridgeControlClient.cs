using System.IO.Pipes;
using NfeAgendamento.Bridge.Runtime;

namespace NfeAgendamento.App.Runtime;

public interface IBridgeControlTransport
{
    Task<BridgeControlResponse> SendAsync(
        BridgeControlRequest request,
        CancellationToken cancellationToken);
}

public sealed class NamedPipeBridgeControlTransport : IBridgeControlTransport
{
    private readonly string _pipeName;
    private readonly TimeSpan _connectTimeout;

    public NamedPipeBridgeControlTransport(
        string pipeName = BridgeControlConstants.PipeName,
        TimeSpan? connectTimeout = null)
    {
        _pipeName = string.IsNullOrWhiteSpace(pipeName)
            ? throw new ArgumentException("Pipe de controle não informado.", nameof(pipeName))
            : pipeName;
        _connectTimeout = connectTimeout ?? TimeSpan.FromSeconds(2);
    }

    public async Task<BridgeControlResponse> SendAsync(
        BridgeControlRequest request,
        CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_connectTimeout);

        await using var pipe = new NamedPipeClientStream(
            ".",
            _pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);
        await pipe.ConnectAsync(timeout.Token);
        await BridgeControlProtocol.WriteAsync(pipe, request, timeout.Token);
        return await BridgeControlProtocol.ReadResponseAsync(pipe, timeout.Token);
    }
}

public sealed class BridgeControlClient
{
    private readonly IBridgeControlTransport _transport;
    private readonly string _expectedExecutablePath;
    private readonly string _expectedVersion;
    private string? _leaseId;

    public BridgeControlClient(
        IBridgeControlTransport transport,
        string expectedExecutablePath,
        string expectedVersion)
    {
        _transport = transport ?? throw new ArgumentNullException(nameof(transport));
        _expectedExecutablePath = Path.GetFullPath(
            string.IsNullOrWhiteSpace(expectedExecutablePath)
                ? throw new ArgumentException("Caminho esperado do Bridge não informado.", nameof(expectedExecutablePath))
                : expectedExecutablePath);
        _expectedVersion = string.IsNullOrWhiteSpace(expectedVersion)
            ? throw new ArgumentException("Versão esperada do Bridge não informada.", nameof(expectedVersion))
            : expectedVersion;
    }

    public BridgeControlIdentity? Identity { get; private set; }

    public async Task<BridgeControlIdentity> ClaimAsync(CancellationToken cancellationToken)
    {
        var hello = await _transport.SendAsync(
            new BridgeControlRequest(
                BridgeControlProtocol.ProtocolVersion,
                BridgeControlMessageTypes.Hello),
            cancellationToken);
        EnsureSuccess(hello, "Não foi possível identificar o Bridge gerenciado.");

        var identity = hello.Identity
            ?? throw new InvalidDataException("O Bridge não retornou identidade.");
        ValidateIdentity(identity);

        var claim = await _transport.SendAsync(
            new BridgeControlRequest(
                BridgeControlProtocol.ProtocolVersion,
                BridgeControlMessageTypes.ClaimLease),
            cancellationToken);
        EnsureSuccess(claim, "Não foi possível assumir o controle do Bridge.");

        var leaseId = claim.LeaseId;
        if (string.IsNullOrWhiteSpace(leaseId))
            throw new InvalidDataException("O Bridge não retornou lease de controle.");

        Identity = identity;
        _leaseId = leaseId;
        return identity;
    }

    public async Task HeartbeatAsync(CancellationToken cancellationToken)
    {
        var leaseId = RequireLease();
        var response = await _transport.SendAsync(
            new BridgeControlRequest(
                BridgeControlProtocol.ProtocolVersion,
                BridgeControlMessageTypes.Heartbeat,
                leaseId),
            cancellationToken);
        EnsureSuccess(response, "O Bridge rejeitou o heartbeat de controle.");
    }

    public async Task ShutdownAsync(CancellationToken cancellationToken)
    {
        var leaseId = RequireLease();
        var response = await _transport.SendAsync(
            new BridgeControlRequest(
                BridgeControlProtocol.ProtocolVersion,
                BridgeControlMessageTypes.Shutdown,
                leaseId),
            cancellationToken);
        EnsureSuccess(response, "O Bridge rejeitou o encerramento controlado.");
    }

    private void ValidateIdentity(BridgeControlIdentity identity)
    {
        var pathMatches = string.Equals(
            Path.GetFullPath(identity.ExecutablePath),
            _expectedExecutablePath,
            StringComparison.OrdinalIgnoreCase);
        var versionMatches = string.Equals(identity.Version, _expectedVersion, StringComparison.Ordinal);

        if (!identity.Managed || identity.ProcessId <= 0 ||
            string.IsNullOrWhiteSpace(identity.InstanceId) || !pathMatches || !versionMatches)
        {
            throw new InvalidDataException("A identidade do Bridge gerenciado não corresponde ao executável esperado.");
        }
    }

    private string RequireLease() =>
        _leaseId ?? throw new InvalidOperationException("O App ainda não controla uma instância válida do Bridge.");

    private static void EnsureSuccess(BridgeControlResponse response, string message)
    {
        if (response.Success)
            return;

        var suffix = string.IsNullOrWhiteSpace(response.Error) ? string.Empty : $" ({response.Error})";
        throw new InvalidOperationException(message + suffix);
    }
}
