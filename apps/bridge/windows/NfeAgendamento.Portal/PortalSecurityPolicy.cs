namespace NfeAgendamento.Portal;

internal static class PortalSecurityPolicy
{
    internal const string OfficialHost = "www.nfe.fazenda.gov.br";
    internal const string PortalUrl = "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g%3D";
    internal static readonly TimeSpan ExpectedDialogWindow = TimeSpan.FromSeconds(60);

    internal static bool IsAllowedTopLevelUri(string? uri) =>
        string.Equals(uri, "about:blank", StringComparison.OrdinalIgnoreCase) || IsOfficialPortalUri(uri);

    internal static bool IsOfficialPortalUri(string? uri) =>
        TryCreateOfficialHttpsUri(uri, out _);

    internal static bool IsOfficialConsultPage(string? uri) =>
        TryCreateOfficialHttpsUri(uri, out var parsed) &&
        string.Equals(parsed!.AbsolutePath, "/portal/consultaRecaptcha.aspx", StringComparison.OrdinalIgnoreCase);

    internal static bool IsOfficialXmlDownload(string? uri) =>
        TryCreateOfficialHttpsUri(uri, out var parsed) &&
        string.Equals(parsed!.AbsolutePath, "/portal/downloadNFe.aspx", StringComparison.OrdinalIgnoreCase);

    internal static bool IsOfficialHost(string? host) =>
        string.Equals(host, OfficialHost, StringComparison.OrdinalIgnoreCase);

    internal static bool IsExpectedDownloadConfirmation(string? message) =>
        !string.IsNullOrWhiteSpace(message) &&
        message.Contains("download", StringComparison.OrdinalIgnoreCase) &&
        message.Contains("certificado digital", StringComparison.OrdinalIgnoreCase);

    internal static bool IsExpectedDialogContext(
        bool armed,
        DateTime nowUtc,
        DateTime deadlineUtc,
        string? accessKey,
        string? uri) =>
        armed &&
        nowUtc <= deadlineUtc &&
        !string.IsNullOrWhiteSpace(accessKey) &&
        IsOfficialPortalUri(uri);

    internal static string CreateTemporaryDownloadPath(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        return Path.Combine(directory, $"{Guid.NewGuid():N}.xml");
    }

    private static bool TryCreateOfficialHttpsUri(string? uri, out Uri? parsed)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var candidate) &&
            string.Equals(candidate.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
            IsOfficialHost(candidate.Host))
        {
            parsed = candidate;
            return true;
        }

        parsed = null;
        return false;
    }
}
