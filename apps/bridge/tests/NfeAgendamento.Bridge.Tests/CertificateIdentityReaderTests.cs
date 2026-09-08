using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using NfeAgendamento.Bridge.Certificates;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class CertificateIdentityReaderTests
{
    [Fact]
    public void ReadCnpj_prefers_14_digits_after_common_name_colon()
    {
        using var certificate = CreateCertificate("CN=EMPRESA TESTE:12345678000195, O=Empresa Teste, C=BR");

        var cnpj = CertificateIdentityReader.ReadCnpj(certificate);

        Assert.Equal("12345678000195", cnpj);
    }

    [Fact]
    public void ReadCnpj_accepts_single_unambiguous_14_digit_value_in_subject()
    {
        using var certificate = CreateCertificate("CN=EMPRESA TESTE, OU=12345678000195, O=Empresa Teste, C=BR");

        var cnpj = CertificateIdentityReader.ReadCnpj(certificate);

        Assert.Equal("12345678000195", cnpj);
    }

    [Fact]
    public void ReadCnpj_rejects_subject_without_unambiguous_cnpj()
    {
        using var certificate = CreateCertificate("CN=EMPRESA TESTE, O=Empresa Teste, C=BR");

        var exception = Assert.Throws<CertificateIdentityException>(() =>
            CertificateIdentityReader.ReadCnpj(certificate));

        Assert.Contains("CNPJ", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    private static X509Certificate2 CreateCertificate(string subject)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            subject,
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
}
