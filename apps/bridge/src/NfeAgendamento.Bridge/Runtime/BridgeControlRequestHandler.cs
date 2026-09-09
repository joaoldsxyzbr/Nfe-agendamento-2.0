namespace NfeAgendamento.Bridge.Runtime;

public sealed class BridgeControlRequestHandler
{
    private readonly BridgeControlState _state;
    private readonly Func<DateTimeOffset> _clock;

    public BridgeControlRequestHandler(
        BridgeControlState state,
        Func<DateTimeOffset>? clock = null)
    {
        _state = state ?? throw new ArgumentNullException(nameof(state));
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
    }

    public BridgeControlDispatchResult Handle(BridgeControlRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        return request.Type switch
        {
            BridgeControlMessageTypes.Hello => Success(identity: _state.Identity),
            BridgeControlMessageTypes.ClaimLease => HandleClaimLease(),
            BridgeControlMessageTypes.Heartbeat => HandleHeartbeat(request.LeaseId),
            BridgeControlMessageTypes.Shutdown => HandleShutdown(request.LeaseId),
            _ => Failure("unsupported_command"),
        };
    }

    private BridgeControlDispatchResult HandleClaimLease()
    {
        var leaseId = _state.TryClaimLease(_clock());
        return leaseId is null
            ? Failure("lease_unavailable")
            : Success(leaseId: leaseId);
    }

    private BridgeControlDispatchResult HandleHeartbeat(string? leaseId)
    {
        return !string.IsNullOrWhiteSpace(leaseId) && _state.Heartbeat(leaseId, _clock())
            ? Success()
            : Failure("invalid_lease");
    }

    private BridgeControlDispatchResult HandleShutdown(string? leaseId)
    {
        if (string.IsNullOrWhiteSpace(leaseId) || !_state.RequestShutdown(leaseId))
            return Failure("invalid_lease");

        return new BridgeControlDispatchResult(
            new BridgeControlResponse(BridgeControlProtocol.ProtocolVersion, Success: true),
            StopApplication: true);
    }

    private static BridgeControlDispatchResult Success(
        BridgeControlIdentity? identity = null,
        string? leaseId = null) =>
        new(
            new BridgeControlResponse(
                BridgeControlProtocol.ProtocolVersion,
                Success: true,
                Identity: identity,
                LeaseId: leaseId),
            StopApplication: false);

    private static BridgeControlDispatchResult Failure(string error) =>
        new(
            new BridgeControlResponse(
                BridgeControlProtocol.ProtocolVersion,
                Success: false,
                Error: error),
            StopApplication: false);
}
