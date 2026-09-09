namespace NfeAgendamento.Bridge.Runtime;

public static class BridgeControlMessageTypes
{
    public const string Hello = "hello";
    public const string ClaimLease = "claim_lease";
    public const string Heartbeat = "heartbeat";
    public const string Shutdown = "shutdown";
}

public sealed record BridgeControlRequest(
    int ProtocolVersion,
    string Type,
    string? LeaseId = null);

public sealed record BridgeControlIdentity(
    int ProcessId,
    string Version,
    string ExecutablePath,
    string InstanceId,
    bool Managed);

public sealed record BridgeControlResponse(
    int ProtocolVersion,
    bool Success,
    string? Error = null,
    BridgeControlIdentity? Identity = null,
    string? LeaseId = null);
