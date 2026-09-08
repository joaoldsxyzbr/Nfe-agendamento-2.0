using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class NfeLookupServiceTests
{
    private const string ValidKey = "42260812345678000123550010000012341000012342";

    [Fact]
    public async Task CStat_138_with_xml_returns_success_and_preserves_raw_xml()
    {
        const string xml = "<nfeProc versao=\"4.00\"><NFe /></nfeProc>";
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new TransportResult("138", "Documento localizado", xml));
        var service = new NfeLookupService(transport, () => certificate);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.Success, result.Category);
        Assert.Equal("138", result.CStat);
        Assert.Equal(xml, result.Xml);
        Assert.Equal(1, transport.CallCount);
    }

    [Fact]
    public async Task CStat_137_returns_fiscal_status_without_xml()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new TransportResult("137", "Nenhum documento localizado", null));
        var service = new NfeLookupService(transport, () => certificate);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.FiscalStatus, result.Category);
        Assert.Equal("137", result.CStat);
        Assert.Null(result.Xml);
        Assert.Equal(1, transport.CallCount);
    }

    [Fact]
    public async Task CStat_656_returns_consumption_limit_without_retry()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new TransportResult("656", "Consumo indevido", null));
        var service = new NfeLookupService(transport, () => certificate);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.ConsumptionLimit, result.Category);
        Assert.Equal("656", result.CStat);
        Assert.Equal(1, transport.CallCount);
    }

    [Fact]
    public async Task Http_429_returns_consumption_limit_without_retry()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new HttpRequestException(
            "Too many requests",
            inner: null,
            statusCode: HttpStatusCode.TooManyRequests));
        var service = new NfeLookupService(transport, () => certificate);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.ConsumptionLimit, result.Category);
        Assert.Null(result.Xml);
        Assert.Equal(1, transport.CallCount);
    }

    [Fact]
    public async Task Ambiguous_transport_failure_is_not_retried()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new HttpRequestException("Conexão encerrada após envio"));
        var service = new NfeLookupService(transport, () => certificate);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.TransportUnavailable, result.Category);
        Assert.Null(result.Xml);
        Assert.Equal(1, transport.CallCount);
    }

    [Fact]
    public async Task Missing_selected_certificate_fails_before_transport()
    {
        var transport = new FakeTransport(new TransportResult("138", "Documento localizado", "<xml />"));
        var service = new NfeLookupService(transport, () => null);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.CertificateError, result.Category);
        Assert.Equal(0, transport.CallCount);
    }

    [Fact]
    public async Task Invalid_transport_payload_returns_technical_error_without_retry()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new InvalidDataException("Resposta fiscal inválida"));
        var service = new NfeLookupService(transport, () => certificate);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.TechnicalError, result.Category);
        Assert.Equal(1, transport.CallCount);
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
        private readonly TransportResult? _result;
        private readonly Exception? _exception;

        public FakeTransport(TransportResult result) => _result = result;

        public FakeTransport(Exception exception) => _exception = exception;

        public int CallCount { get; private set; }

        public Task<TransportResult> LookupAsync(
            string accessKey,
            X509Certificate2 certificate,
            CancellationToken cancellationToken)
        {
            CallCount++;
            if (_exception is not null)
            {
                return Task.FromException<TransportResult>(_exception);
            }

            return Task.FromResult(_result!);
        }
    }
}
