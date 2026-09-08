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
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class CertificateEndpointsIntegrationTests : IAsyncDisposable
{
    private const string AllowedOrigin = "https://nfeagendamento.example";
    private readonly string _temporaryRoot;
    private readonly X509Certificate2 _certificate;
    private readonly WebApplicationFactory<Program> _factory;

    public CertificateEndpointsIntegrationTests()
    {
        _temporaryRoot = Path.Combine(Path.GetTempPath(), $"nfe-bridge-endpoints-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_temporaryRoot);
        _certificate = CreateCertificate();
        var certificateService = new CertificateService(
            Path.Combine(_temporaryRoot, "settings.json"),
            () => [_certificate]);

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
                });
            });
    }

    [Fact]
    public async Task Certificates_endpoint_returns_only_safe_metadata()
    {
        using var client = CreateClient();
        using var request = Request(HttpMethod.Get, "/api/v1/certificates");

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        var certificates = payload.RootElement.GetProperty("certificates");
        var item = Assert.Single(certificates.EnumerateArray().ToArray());
        Assert.Equal(_certificate.Thumbprint, item.GetProperty("thumbprint").GetString());
        Assert.Equal(_certificate.Subject, item.GetProperty("subject").GetString());
        Assert.True(item.TryGetProperty("issuer", out _));
        Assert.True(item.TryGetProperty("notBefore", out _));
        Assert.True(item.TryGetProperty("notAfter", out _));
        Assert.False(item.TryGetProperty("rawData", out _));
        Assert.False(item.TryGetProperty("privateKey", out _));
        Assert.Equal(JsonValueKind.Null, payload.RootElement.GetProperty("selectedThumbprint").ValueKind);
    }

    [Fact]
    public async Task Select_endpoint_persists_choice_and_health_reports_selected()
    {
        using var client = CreateClient();
        using var selectRequest = Request(HttpMethod.Post, "/api/v1/certificate/select");
        selectRequest.Content = JsonContent.Create(new { thumbprint = _certificate.Thumbprint });

        using var selectResponse = await client.SendAsync(selectRequest, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NoContent, selectResponse.StatusCode);

        using var healthRequest = Request(HttpMethod.Get, "/api/v1/health");
        using var healthResponse = await client.SendAsync(healthRequest, TestContext.Current.CancellationToken);
        var health = await healthResponse.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.True(health.GetProperty("certificateSelected").GetBoolean());
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        _certificate.Dispose();
        try
        {
            Directory.Delete(_temporaryRoot, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
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
        var oids = new OidCollection { new Oid("1.3.6.1.5.5.7.3.2") };
        request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(oids, critical: false));
        using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(30));
        return X509CertificateLoader.LoadPkcs12(
            generated.Export(X509ContentType.Pfx),
            password: null,
            keyStorageFlags: X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);
    }
}
