using System.Security.Cryptography.X509Certificates;

namespace NfeAgendamento.Bridge.Fiscal;

public sealed record FiscalCoordinationDecision(
    bool AllowDirectLookup,
    DateTimeOffset? BlockedUntilUtc,
    string? Reason);

public interface IFiscalUsageCoordinator
{
    Task<FiscalCoordinationDecision> ReserveAsync(
        X509Certificate2 certificate,
        CancellationToken cancellationToken = default);

    Task BlockAsync(
        X509Certificate2 certificate,
        CancellationToken cancellationToken = default);
}

public sealed class DisabledFiscalUsageCoordinator : IFiscalUsageCoordinator
{
    public static DisabledFiscalUsageCoordinator Instance { get; } = new();

    private DisabledFiscalUsageCoordinator()
    {
    }

    public Task<FiscalCoordinationDecision> ReserveAsync(
        X509Certificate2 certificate,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(certificate);
        return Task.FromResult(new FiscalCoordinationDecision(true, null, null));
    }

    public Task BlockAsync(
        X509Certificate2 certificate,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(certificate);
        return Task.CompletedTask;
    }
}

public sealed class FiscalCoordinationUnavailableException : Exception
{
    public FiscalCoordinationUnavailableException(string message)
        : base(message)
    {
    }

    public FiscalCoordinationUnavailableException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
