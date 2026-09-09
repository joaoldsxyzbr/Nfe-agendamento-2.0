namespace NfeAgendamento.Bridge.Runtime;

public static class BridgeControlConstants
{
    public const string PipeName = "NfeAgendamento.Bridge.Control.v1";
    public static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(2);
    public static readonly TimeSpan LeaseTimeout = TimeSpan.FromSeconds(8);
    public static readonly TimeSpan InitialLeaseTimeout = TimeSpan.FromSeconds(10);
    public static readonly TimeSpan WatchdogInterval = TimeSpan.FromMilliseconds(500);
}

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

public sealed record BridgeControlDispatchResult(
    BridgeControlResponse Response,
    bool StopApplication);
