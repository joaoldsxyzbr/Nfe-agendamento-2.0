using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NfeAgendamento.Bridge.Certificates;
using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class NfeLookupEndpointIntegrationTests : IAsyncDisposable
{
    private const string AllowedOrigin = "https://nfeagendamento.example";
    private const string ValidAccessKey = "35260812345678000195550010000000011000000018";

    private readonly string _temporaryRoot;
    private readonly X509Certificate2 _certificate;
    private readonly FakeTransport _transport;
    private readonly WebApplicationFactory<Program> _factory;

    public NfeLookupEndpointIntegrationTests()
    {
        _temporaryRoot = Path.Combine(
            Path.GetTempPath(),
            $"nfe-bridge-lookup-endpoint-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_temporaryRoot);

        _certificate = CreateCertificate();
        var settingsPath = Path.Combine(_temporaryRoot, "settings.json");
        File.WriteAllText(
            settingsPath,
            JsonSerializer.Serialize(new { selectedThumbprint = _certificate.Thumbprint }));
        var certificateService = new CertificateService(settingsPath, () => [_certificate]);
        _transport = new FakeTransport(new TransportResult(
            "137",
            "Nenhum documento localizado",
            null));

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Production");
                builder.ConfigureAppConfiguration((_, configuration) =>
                {
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Bridge:AllowedOrigins:0"] = AllowedOrigin,
                    });
                });
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<CertificateService>();
                    services.AddSingleton(certificateService);
                    services.RemoveAll<INfeDistributionTransport>();
                    services.AddSingleton<INfeDistributionTransport>(_transport);
                });
            });
    }

    [Fact]
    public async Task Lookup_endpoint_returns_normalized_result_without_real_network()
    {
        using var client = CreateClient();
        using var request = Request(HttpMethod.Post, "/api/v1/nfe/lookup");
        request.Content = JsonContent.Create(new { accessKey = ValidAccessKey });

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal(LookupCategories.FiscalStatus, payload.GetProperty("category").GetString());
        Assert.Equal("137", payload.GetProperty("cStat").GetString());
        Assert.Equal(JsonValueKind.Null, payload.GetProperty("xml").ValueKind);
        Assert.Equal(1, _transport.CallCount);
        Assert.Equal(_certificate.Thumbprint, _transport.ObservedCertificateThumbprint);
    }

    [Fact]
    public async Task Lookup_endpoint_rejects_invalid_access_key_before_transport()
    {
        using var client = CreateClient();
        using var request = Request(HttpMethod.Post, "/api/v1/nfe/lookup");
        request.Content = JsonContent.Create(new { accessKey = "123" });

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.Equal("invalid_access_key", payload.GetProperty("error").GetString());
        Assert.Equal(0, _transport.CallCount);
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        _certificate.Dispose();
        try
        {
            Directory.Delete(_temporaryRoot, recursive: true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
        }

        GC.SuppressFinalize(this);
    }

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("http://127.0.0.1:17345"),
        AllowAutoRedirect = false,
    });

    private static HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Host = "127.0.0.1:17345";
        request.Headers.Add("Origin", AllowedOrigin);
        return request;
    }

    private static X509Certificate2 CreateCertificate()
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=EMPRESA TESTE:12345678000195, O=Empresa Teste, C=BR",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        using var generated = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddDays(-1),
            DateTimeOffset.UtcNow.AddDays(30));
        return X509CertificateLoader.LoadPkcs12(
            generated.Export(X509ContentType.Pfx),
            password: null,
            keyStorageFlags: X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);
    }

    private sealed class FakeTransport : INfeDistributionTransport
    {
        private readonly TransportResult _result;

        public FakeTransport(TransportResult result)
        {
            _result = result;
        }

        public int CallCount { get; private set; }
        public string? ObservedCertificateThumbprint { get; private set; }

        public Task<TransportResult> LookupAsync(
            string accessKey,
            X509Certificate2 certificate,
            CancellationToken cancellationToken)
        {
            CallCount++;
            ObservedCertificateThumbprint = certificate.Thumbprint;
            return Task.FromResult(_result);
        }
    }
}
