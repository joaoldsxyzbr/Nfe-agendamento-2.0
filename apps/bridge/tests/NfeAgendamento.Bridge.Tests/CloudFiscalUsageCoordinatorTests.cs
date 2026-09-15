using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class CloudFiscalUsageCoordinatorTests
{
    [Fact]
    public async Task Reserve_sends_only_bearer_credential_and_reads_shared_decision()
    {
        using var certificate = CreateCertificate();
        HttpRequestMessage? observed = null;
        using var handler = new StubHandler(request =>
        {
            observed = CloneRequest(request);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    "{\"allowDirectLookup\":false,\"blockedUntilUtc\":\"2026-09-15T18:00:00Z\",\"reason\":\"shared_limit\"}",
                    Encoding.UTF8,
                    "application/json"),
            };
        });
        using var coordinator = new CloudFiscalUsageCoordinator(
            new HttpClient(handler),
            new Uri("https://coordination.example/api/fiscal-coordination/"));

        var decision = await coordinator.ReserveAsync(
            certificate,
            TestContext.Current.CancellationToken);

        Assert.False(decision.AllowDirectLookup);
        Assert.Equal("shared_limit", decision.Reason);
        Assert.Equal(new DateTimeOffset(2026, 9, 15, 18, 0, 0, TimeSpan.Zero), decision.BlockedUntilUtc);
        Assert.NotNull(observed);
        Assert.Equal(HttpMethod.Post, observed.Method);
        Assert.Equal("https://coordination.example/api/fiscal-coordination/reserve", observed.RequestUri?.AbsoluteUri);
        Assert.Equal("Bearer", observed.Headers.Authorization?.Scheme);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", observed.Headers.Authorization?.Parameter ?? string.Empty);
        Assert.Null(observed.Content);
    }

    [Fact]
    public async Task Network_failure_is_reported_as_coordination_unavailable()
    {
        using var certificate = CreateCertificate();
        using var handler = new ThrowingHandler();
        using var coordinator = new CloudFiscalUsageCoordinator(
            new HttpClient(handler),
            new Uri("https://coordination.example/api/fiscal-coordination/"));

        await Assert.ThrowsAsync<FiscalCoordinationUnavailableException>(() =>
            coordinator.ReserveAsync(certificate, TestContext.Current.CancellationToken));
    }

    [Fact]
    public void Coordinator_rejects_non_https_endpoint()
    {
        using var client = new HttpClient(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)));
        Assert.Throws<ArgumentException>(() =>
            new CloudFiscalUsageCoordinator(
                client,
                new Uri("http://coordination.example/api/fiscal-coordination/")));
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

    private static HttpRequestMessage CloneRequest(HttpRequestMessage source)
    {
        var clone = new HttpRequestMessage(source.Method, source.RequestUri);
        foreach (var header in source.Headers)
        {
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);
        }
        return clone;
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;

        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> handler)
        {
            _handler = handler;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) => Task.FromResult(_handler(request));
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            throw new HttpRequestException("offline");
    }
}
