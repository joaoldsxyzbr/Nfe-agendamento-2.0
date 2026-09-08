namespace NfeAgendamento.Bridge.Security;

public sealed class LocalRequestGuard
{
    private const string ExpectedHost = "127.0.0.1:17345";
    private readonly HashSet<string> _allowedOrigins;

    public LocalRequestGuard(IEnumerable<string> allowedOrigins)
    {
        ArgumentNullException.ThrowIfNull(allowedOrigins);

        _allowedOrigins = allowedOrigins
            .Select(NormalizeOrigin)
            .Where(static origin => origin is not null)
            .Select(static origin => origin!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public bool IsAllowedOrigin(string? origin)
    {
        var normalized = NormalizeOrigin(origin);
        return normalized is not null && _allowedOrigins.Contains(normalized);
    }

    public bool IsAllowedHost(string? host) =>
        string.Equals(host, ExpectedHost, StringComparison.OrdinalIgnoreCase);

    private static string? NormalizeOrigin(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin) ||
            !Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) ||
            uri.AbsolutePath != "/")
        {
            return null;
        }

        return uri.GetLeftPart(UriPartial.Authority);
    }
}
