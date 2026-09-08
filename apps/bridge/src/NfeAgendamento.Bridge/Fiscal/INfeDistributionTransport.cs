using System.Security.Cryptography.X509Certificates;

namespace NfeAgendamento.Bridge.Fiscal;

public sealed record TransportResult(
    string CStat,
    string Message,
    string? Xml);

public interface INfeDistributionTransport
{
    Task<TransportResult> LookupAsync(
        string accessKey,
        X509Certificate2 certificate,
        CancellationToken cancellationToken);
}
