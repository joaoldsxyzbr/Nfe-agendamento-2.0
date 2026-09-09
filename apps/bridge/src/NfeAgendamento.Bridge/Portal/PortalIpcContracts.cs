namespace NfeAgendamento.Bridge.Portal;

public static class PortalIpcMessageType
{
    public const string Ready = "ready";
    public const string StartOperation = "start_operation";
    public const string WaitingForUser = "waiting_for_user";
    public const string Completed = "completed";
    public const string Cancelled = "cancelled";
    public const string Failed = "failed";
    public const string Shutdown = "shutdown";
    public const string Heartbeat = "heartbeat";
}

public sealed record PortalIpcEnvelope(
    string Type,
    string? OperationId = null,
    string? AccessKey = null,
    string? CertificateThumbprint = null,
    string? Xml = null,
    string? Message = null);
