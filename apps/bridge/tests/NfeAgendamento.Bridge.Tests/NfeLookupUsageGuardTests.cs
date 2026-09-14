using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class NfeLookupUsageGuardTests
{
    private const string ValidKey = "42260812345678000123550010000012341000012342";

    [Fact]
    public async Task Consumption_limit_blocks_following_direct_transport_call()
    {
        using var certificate = CreateCertificate();
        var transport = new SequenceTransport(
            new TransportResult("656", "Consumo indevido", null),
            new TransportResult("138", "Não deveria ser chamado", "<xml />"));
        var now = new DateTimeOffset(2026, 9, 14, 18, 0, 0, TimeSpan.Zero);
        var guard = new FiscalUsageGuard(utcNow: () => now);
        var service = new NfeLookupService(transport, () => Clone(certificate), guard);

        var first = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);
        var second = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.ConsumptionLimit, first.Category);
        Assert.Equal(LookupCategories.ConsumptionLimit, second.Category);
        Assert.Equal(1, transport.CallCount);
        Assert.Contains("Proteção fiscal local ativa", second.Message);
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

    private static X509Certificate2 Clone(X509Certificate2 certificate) =>
        X509CertificateLoader.LoadPkcs12(
            certificate.Export(X509ContentType.Pfx),
            password: null,
            keyStorageFlags: X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);

    private sealed class SequenceTransport : INfeDistributionTransport
    {
        private readonly Queue<TransportResult> _results;

        public SequenceTransport(params TransportResult[] results)
        {
            _results = new Queue<TransportResult>(results);
        }

        public int CallCount { get; private set; }

        public Task<TransportResult> LookupAsync(
            string accessKey,
            X509Certificate2 certificate,
            CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(_results.Dequeue());
        }
    }
}
