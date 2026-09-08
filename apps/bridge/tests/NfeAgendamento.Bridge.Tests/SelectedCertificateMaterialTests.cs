using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using NfeAgendamento.Bridge.Certificates;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class SelectedCertificateMaterialTests
{
    [Fact]
    public async Task GetSelectedCertificate_returns_independent_usable_certificate_with_private_key()
    {
        var now = DateTimeOffset.UtcNow;
        using var certificate = CreateCertificate(now.AddDays(-1), now.AddDays(30));
        using var temporary = new TemporaryDirectory();
        var service = new CertificateService(
            Path.Combine(temporary.Path, "settings.json"),
            () => [certificate]);

        await service.SelectAsync(certificate.Thumbprint!, TestContext.Current.CancellationToken);

        var selected = service.GetSelectedCertificate();

        Assert.NotNull(selected);
        Assert.NotSame(certificate, selected);
        Assert.Equal(certificate.Thumbprint, selected.Thumbprint);
        Assert.True(selected.HasPrivateKey);

        selected.Dispose();
        Assert.True(certificate.HasPrivateKey);
    }

    private static X509Certificate2 CreateCertificate(
        DateTimeOffset notBefore,
        DateTimeOffset notAfter)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(
            "CN=EMPRESA TESTE:12345678000195, O=Empresa Teste, C=BR",
            rsa,
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        using var generated = request.CreateSelfSigned(notBefore, notAfter);
        return X509CertificateLoader.LoadPkcs12(
            generated.Export(X509ContentType.Pfx),
            password: null,
            keyStorageFlags: X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public TemporaryDirectory()
        {
            Path = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                $"nfe-bridge-material-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
            }
        }
    }
}
