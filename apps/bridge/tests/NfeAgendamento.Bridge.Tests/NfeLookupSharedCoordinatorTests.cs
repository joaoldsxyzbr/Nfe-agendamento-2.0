using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class NfeLookupSharedCoordinatorTests
{
    private const string ValidKey = "42260812345678000123550010000012341000012342";

    [Fact]
    public async Task Shared_coordination_failure_blocks_direct_transport_conservatively()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new TransportResult("138", "Documento localizado", "<xml />"));
        var coordinator = new FakeCoordinator
        {
            ReserveException = new FiscalCoordinationUnavailableException("offline"),
        };
        var service = new NfeLookupService(
            transport,
            () => Clone(certificate),
            new FiscalUsageGuard(),
            coordinator);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.ConsumptionLimit, result.Category);
        Assert.Equal(0, transport.CallCount);
        Assert.Equal(1, coordinator.ReserveCallCount);
        Assert.Contains("proteção fiscal compartilhada", result.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Shared_limit_blocks_direct_transport_before_sefaz()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new TransportResult("138", "Documento localizado", "<xml />"));
        var blockedUntil = DateTimeOffset.UtcNow.AddMinutes(30);
        var coordinator = new FakeCoordinator
        {
            ReserveDecision = new FiscalCoordinationDecision(false, blockedUntil, "shared_limit"),
        };
        var service = new NfeLookupService(
            transport,
            () => Clone(certificate),
            new FiscalUsageGuard(),
            coordinator);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.ConsumptionLimit, result.Category);
        Assert.Equal(0, transport.CallCount);
        Assert.Equal(1, coordinator.ReserveCallCount);
    }

    [Fact]
    public async Task Cstat_656_is_propagated_to_shared_coordinator()
    {
        using var certificate = CreateCertificate();
        var transport = new FakeTransport(new TransportResult("656", "Consumo indevido", null));
        var coordinator = new FakeCoordinator();
        var service = new NfeLookupService(
            transport,
            () => Clone(certificate),
            new FiscalUsageGuard(),
            coordinator);

        var result = await service.LookupAsync(ValidKey, TestContext.Current.CancellationToken);

        Assert.Equal(LookupCategories.ConsumptionLimit, result.Category);
        Assert.Equal(1, transport.CallCount);
        Assert.Equal(1, coordinator.ReserveCallCount);
        Assert.Equal(1, coordinator.BlockCallCount);
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

    private sealed class FakeCoordinator : IFiscalUsageCoordinator
    {
        public FiscalCoordinationDecision ReserveDecision { get; set; } = new(true, null, null);
        public FiscalCoordinationUnavailableException? ReserveException { get; set; }
        public int ReserveCallCount { get; private set; }
        public int BlockCallCount { get; private set; }

        public Task<FiscalCoordinationDecision> ReserveAsync(
            X509Certificate2 certificate,
            CancellationToken cancellationToken = default)
        {
            ReserveCallCount++;
            if (ReserveException is not null) throw ReserveException;
            return Task.FromResult(ReserveDecision);
        }

        public Task BlockAsync(
            X509Certificate2 certificate,
            CancellationToken cancellationToken = default)
        {
            BlockCallCount++;
            return Task.CompletedTask;
        }
    }

    private sealed class FakeTransport : INfeDistributionTransport
    {
        private readonly TransportResult _result;

        public FakeTransport(TransportResult result) => _result = result;

        public int CallCount { get; private set; }

        public Task<TransportResult> LookupAsync(
            string accessKey,
            X509Certificate2 certificate,
            CancellationToken cancellationToken)
        {
            CallCount++;
            return Task.FromResult(_result);
        }
    }
}
