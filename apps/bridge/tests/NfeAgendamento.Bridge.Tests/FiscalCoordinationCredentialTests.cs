using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using NfeAgendamento.Bridge.Fiscal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class FiscalCoordinationCredentialTests
{
    [Fact]
    public void Same_rsa_a1_produces_same_high_entropy_coordination_token()
    {
        using var certificate = CreateRsaCertificate("12345678000195");
        using var clone = Clone(certificate);

        var first = FiscalCoordinationCredential.Create(certificate);
        var second = FiscalCoordinationCredential.Create(clone);

        Assert.Equal(first, second);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", first);
    }

    [Fact]
    public void Different_private_keys_do_not_share_coordination_token()
    {
        using var firstCertificate = CreateRsaCertificate("12345678000195");
        using var secondCertificate = CreateRsaCertificate("12345678000195");

        Assert.NotEqual(
            FiscalCoordinationCredential.Create(firstCertificate),
            FiscalCoordinationCredential.Create(secondCertificate));
    }

    [Fact]
    public void Non_rsa_certificate_fails_closed_for_shared_coordination()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var request = new CertificateRequest(
            "CN=EMPRESA TESTE:12345678000195, O=Empresa Teste, C=BR",
            ecdsa,
            HashAlgorithmName.SHA256);
        using var generated = request.CreateSelfSigned(
            DateTimeOffset.UtcNow.AddDays(-1),
            DateTimeOffset.UtcNow.AddDays(30));
        using var certificate = X509CertificateLoader.LoadPkcs12(
            generated.Export(X509ContentType.Pfx),
            password: null,
            keyStorageFlags: X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);

        Assert.Throws<FiscalCoordinationUnavailableException>(() =>
            FiscalCoordinationCredential.Create(certificate));
    }

    private static X509Certificate2 CreateRsaCertificate(string cnpj)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            $"CN=EMPRESA TESTE:{cnpj}, O=Empresa Teste, C=BR",
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
}
