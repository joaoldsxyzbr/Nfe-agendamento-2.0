using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class SefazDistributionTransportTests
{
    private const string AccessKey = "35260812345678000195550010000000011000000018";

    [Fact]
    public async Task Lookup_posts_consChNFe_with_selected_certificate_and_no_guessed_author_uf()
    {
        using var certificate = CreateCertificate();
        string? observedThumbprint = null;
        string? observedBody = null;
        Uri? observedUri = null;
        string? observedMediaType = null;

        var handler = new RecordingHandler(async (request, cancellationToken) =>
        {
            observedUri = request.RequestUri;
            observedMediaType = request.Content?.Headers.ContentType?.MediaType;
            observedBody = await request.Content!.ReadAsStringAsync(cancellationToken);

            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    Envelope("""
                        <retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
                          <cStat>137</cStat><xMotivo>Nenhum documento localizado</xMotivo>
                        </retDistDFeInt>
                        """),
                    Encoding.UTF8,
                    "text/xml"),
            };
        });

        var transport = new SefazDistributionTransport(selectedCertificate =>
        {
            observedThumbprint = selectedCertificate.Thumbprint;
            return handler;
        });

        var result = await transport.LookupAsync(
            AccessKey,
            certificate,
            TestContext.Current.CancellationToken);

        Assert.Equal("137", result.CStat);
        Assert.Null(result.Xml);
        Assert.Equal(certificate.Thumbprint, observedThumbprint);
        Assert.Equal(
            "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
            observedUri?.AbsoluteUri);
        Assert.Equal("text/xml", observedMediaType);
        Assert.Contains("<CNPJ>12345678000195</CNPJ>", observedBody);
        Assert.Contains($"<consChNFe><chNFe>{AccessKey}</chNFe></consChNFe>", observedBody);
        Assert.DoesNotContain("<cUFAutor>", observedBody);
    }

    [Fact]
    public async Task Lookup_preserves_http_429_for_service_classification()
    {
        using var certificate = CreateCertificate();
        var handler = new RecordingHandler((_, _) => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.TooManyRequests)));
        var transport = new SefazDistributionTransport(_ => handler);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            transport.LookupAsync(
                AccessKey,
                certificate,
                TestContext.Current.CancellationToken));

        Assert.Equal(HttpStatusCode.TooManyRequests, exception.StatusCode);
        Assert.Equal(1, handler.CallCount);
    }

    [Fact]
    public async Task Lookup_rejects_response_larger_than_ten_mebibytes()
    {
        using var certificate = CreateCertificate();
        var oversized = new string('x', (10 * 1024 * 1024) + 1);
        var handler = new RecordingHandler((_, _) => Task.FromResult(
            new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(oversized, Encoding.UTF8, "text/xml"),
            }));
        var transport = new SefazDistributionTransport(_ => handler);

        await Assert.ThrowsAsync<InvalidDataException>(() =>
            transport.LookupAsync(
                AccessKey,
                certificate,
                TestContext.Current.CancellationToken));

        Assert.Equal(1, handler.CallCount);
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

    private static string Envelope(string body) => $"""
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>{body}</soap:Body></soap:Envelope>
        """;

    private sealed class RecordingHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _send;

        public RecordingHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send)
        {
            _send = send;
        }

        public int CallCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            return _send(request, cancellationToken);
        }
    }
}
