using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;

namespace NfeAgendamento.Bridge.Fiscal;

public sealed class CloudFiscalUsageCoordinator : IFiscalUsageCoordinator, IDisposable
{
    public static readonly Uri DefaultBaseUri = new(
        "https://nfeagendamento.joaolds.xyz.br/api/fiscal-coordination/",
        UriKind.Absolute);

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _httpClient;
    private readonly Uri _baseUri;
    private bool _disposed;

    public CloudFiscalUsageCoordinator(HttpClient httpClient, Uri? baseUri = null)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _baseUri = NormalizeBaseUri(baseUri ?? DefaultBaseUri);
    }

    public async Task<FiscalCoordinationDecision> ReserveAsync(
        X509Certificate2 certificate,
        CancellationToken cancellationToken = default)
    {
        var payload = await SendAsync("reserve", certificate, cancellationToken);
        return new FiscalCoordinationDecision(
            payload.AllowDirectLookup,
            payload.BlockedUntilUtc,
            payload.Reason);
    }

    public async Task BlockAsync(
        X509Certificate2 certificate,
        CancellationToken cancellationToken = default)
    {
        await SendAsync("block", certificate, cancellationToken);
    }

    private async Task<CoordinatorResponse> SendAsync(
        string operation,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(certificate);

        var token = FiscalCoordinationCredential.Create(certificate);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(_baseUri, operation));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        try
        {
            using var response = await _httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);
            response.EnsureSuccessStatusCode();

            var payload = await response.Content.ReadFromJsonAsync<CoordinatorResponse>(
                JsonOptions,
                cancellationToken);
            if (payload is null)
            {
                throw new JsonException("Resposta vazia do coordenador fiscal.");
            }

            return payload;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new FiscalCoordinationUnavailableException(
                "A proteção fiscal compartilhada não respondeu a tempo.");
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or NotSupportedException)
        {
            throw new FiscalCoordinationUnavailableException(
                "A proteção fiscal compartilhada está temporariamente indisponível.",
                exception);
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _httpClient.Dispose();
    }

    private static Uri NormalizeBaseUri(Uri uri)
    {
        if (!uri.IsAbsoluteUri || uri.Scheme != Uri.UriSchemeHttps)
        {
            throw new ArgumentException("A URL da coordenação fiscal deve usar HTTPS absoluto.", nameof(uri));
        }

        return new Uri(uri.AbsoluteUri.TrimEnd('/') + "/", UriKind.Absolute);
    }

    private sealed record CoordinatorResponse(
        bool AllowDirectLookup,
        DateTimeOffset? BlockedUntilUtc,
        string? Reason);
}
