using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;

namespace NfeAgendamento.Bridge.Certificates;

public sealed class CertificateService
{
    private const string ClientAuthenticationOid = "1.3.6.1.5.5.7.3.2";
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly string _settingsPath;
    private readonly Func<IReadOnlyList<X509Certificate2>>? _certificateSource;

    public CertificateService()
        : this(Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NfeAgendamentoBridge",
            "settings.json"))
    {
    }

    public CertificateService(
        string settingsPath,
        Func<IReadOnlyList<X509Certificate2>>? certificateSource = null)
    {
        if (string.IsNullOrWhiteSpace(settingsPath))
        {
            throw new ArgumentException("Caminho de configuração do certificado inválido.", nameof(settingsPath));
        }

        _settingsPath = settingsPath;
        _certificateSource = certificateSource;
    }

    public IReadOnlyList<CertificateInfo> ListUsable()
    {
        return WithCertificates(certificates => FilterUsable(certificates, DateTimeOffset.UtcNow)
            .Select(ToInfo)
            .OrderBy(info => info.Subject, StringComparer.CurrentCultureIgnoreCase)
            .ToArray());
    }

    public CertificateInfo? GetSelected()
    {
        var thumbprint = ReadSelectedThumbprint();
        if (thumbprint is null)
        {
            return null;
        }

        return ListUsable().FirstOrDefault(info =>
            string.Equals(info.Thumbprint, thumbprint, StringComparison.OrdinalIgnoreCase));
    }

    public async Task SelectAsync(string thumbprint, CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeThumbprint(thumbprint);
        var selected = ListUsable().FirstOrDefault(info =>
            string.Equals(info.Thumbprint, normalized, StringComparison.OrdinalIgnoreCase));

        if (selected is null)
        {
            throw new InvalidOperationException(
                "O certificado selecionado não foi encontrado, está vencido, não possui chave privada ou não permite autenticação de cliente.");
        }

        var directory = Path.GetDirectoryName(_settingsPath)
            ?? throw new InvalidOperationException("Caminho de configuração local inválido.");
        Directory.CreateDirectory(directory);

        var temporaryPath = _settingsPath + $".{Guid.NewGuid():N}.tmp";
        var json = JsonSerializer.Serialize(
            new CertificateSettings(selected.Thumbprint),
            JsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);

        try
        {
            await using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 4096,
                FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(bytes, cancellationToken);
                await stream.FlushAsync(cancellationToken);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporaryPath, _settingsPath, overwrite: true);
        }
        finally
        {
            TryDelete(temporaryPath);
        }
    }

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
                && instant < certificate.NotAfter.ToUniversalTime()
                && SupportsClientAuthentication(certificate))
            .ToArray();
    }

    public static CertificateInfo ToInfo(X509Certificate2 certificate)
    {
        ArgumentNullException.ThrowIfNull(certificate);

        return new CertificateInfo(
            certificate.Subject,
            certificate.Issuer,
            certificate.NotBefore,
            certificate.NotAfter,
            NormalizeThumbprint(certificate.Thumbprint));
    }

    private T WithCertificates<T>(Func<IEnumerable<X509Certificate2>, T> action)
    {
        ArgumentNullException.ThrowIfNull(action);

        if (_certificateSource is not null)
        {
            return action(_certificateSource());
        }

        using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
        return action(store.Certificates.Cast<X509Certificate2>());
    }

    private string? ReadSelectedThumbprint()
    {
        if (!File.Exists(_settingsPath))
        {
            return null;
        }

        try
        {
            var settings = JsonSerializer.Deserialize<CertificateSettings>(
                File.ReadAllText(_settingsPath),
                JsonOptions);

            return string.IsNullOrWhiteSpace(settings?.SelectedThumbprint)
                ? null
                : NormalizeThumbprint(settings.SelectedThumbprint);
        }
        catch (Exception exception) when (
            exception is JsonException
            or IOException
            or UnauthorizedAccessException
            or ArgumentException)
        {
            return null;
        }
    }

    private static bool SupportsClientAuthentication(X509Certificate2 certificate)
    {
        var ekuExtensions = certificate.Extensions
            .OfType<X509EnhancedKeyUsageExtension>()
            .ToArray();

        if (ekuExtensions.Length == 0)
        {
            return true;
        }

        return ekuExtensions
            .SelectMany(extension => extension.EnhancedKeyUsages.Cast<Oid>())
            .Any(oid => string.Equals(oid.Value, ClientAuthenticationOid, StringComparison.Ordinal));
    }

    private static string NormalizeThumbprint(string thumbprint)
    {
        if (string.IsNullOrWhiteSpace(thumbprint))
        {
            throw new ArgumentException("Thumbprint do certificado não informado.", nameof(thumbprint));
        }

        return string.Concat(thumbprint.Where(character => !char.IsWhiteSpace(character))).ToUpperInvariant();
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
        }
    }

    private sealed record CertificateSettings(string SelectedThumbprint);
}
