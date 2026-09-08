namespace NfeAgendamento.Bridge.Portal;

public static class PortalOperationStates
{
    public const string WaitingForUser = "waiting_for_user";
    public const string Completed = "completed";
    public const string Failed = "failed";
    public const string Cancelled = "cancelled";
}

public sealed record PortalOperationStatus(
    string OperationId,
    string State,
    string? Message,
    string? Xml);

public sealed record PortalLaunchRequest(
    string OperationId,
    string AccessKey,
    string CertificateThumbprint);

public enum PortalLaunchOutcome
{
    Completed,
    Failed,
    Cancelled,
}

public sealed record PortalLaunchResult(
    PortalLaunchOutcome Outcome,
    string? Xml,
    string? Message)
{
    public static PortalLaunchResult Completed(string xml) => new(PortalLaunchOutcome.Completed, xml, null);
    public static PortalLaunchResult Failed(string message) => new(PortalLaunchOutcome.Failed, null, message);
    public static PortalLaunchResult Cancelled(string message) => new(PortalLaunchOutcome.Cancelled, null, message);
}

public interface IPortalWindowLauncher
{
    bool IsAvailable { get; }
    Task<PortalLaunchResult> OpenAsync(PortalLaunchRequest request, CancellationToken cancellationToken);
}
