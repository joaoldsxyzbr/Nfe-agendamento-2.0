using System.Security.Cryptography.X509Certificates;

namespace NfeAgendamento.Bridge.Certificates;

public sealed class CertificateService
{
    public static IReadOnlyList<X509Certificate2> FilterUsable(
        IEnumerable<X509Certificate2> certificates,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(certificates);

        var instant = now.UtcDateTime;
        return certificates
            .Where(certificate =>
                certificate.HasPrivateKey
                && certificate.NotBefore.ToUniversalTime() <= instant
                && instant < certificate.NotAfter.ToUniversalTime())
            .ToArray();
    }

    public static CertificateSelection ToSelection(X509Certificate2 certificate)
    {
        ArgumentNullException.ThrowIfNull(certificate);

        return new CertificateSelection(
            NormalizeThumbprint(certificate.Thumbprint),
            certificate.Subject,
            certificate.NotAfter);
    }

    private static string NormalizeThumbprint(string thumbprint)
    {
        if (string.IsNullOrWhiteSpace(thumbprint))
        {
            throw new ArgumentException("Thumbprint do certificado não informado.", nameof(thumbprint));
        }

        return string.Concat(thumbprint.Where(character => !char.IsWhiteSpace(character))).ToUpperInvariant();
    }
}
