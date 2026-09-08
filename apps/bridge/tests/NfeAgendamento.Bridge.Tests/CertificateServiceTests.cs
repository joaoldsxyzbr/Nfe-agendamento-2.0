using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using NfeAgendamento.Bridge.Certificates;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class CertificateServiceTests
{
    private const string ClientAuthenticationOid = "1.3.6.1.5.5.7.3.2";
    private const string CodeSigningOid = "1.3.6.1.5.5.7.3.3";

    [Fact]
    public void FilterUsable_excludes_expired_future_and_no_private_key_certificates()
    {
        var now = new DateTimeOffset(2026, 9, 8, 12, 0, 0, TimeSpan.Zero);
        using var valid = CreateCertificate(now.AddDays(-1), now.AddDays(30), true, "CN=Valid");
        using var expired = CreateCertificate(now.AddDays(-30), now.AddDays(-1), true, "CN=Expired");
        using var future = CreateCertificate(now.AddDays(1), now.AddDays(30), true, "CN=Future");
        using var withoutPrivateKey = CreateCertificate(now.AddDays(-1), now.AddDays(30), false, "CN=NoKey");

        var result = CertificateService.FilterUsable(
            [valid, expired, future, withoutPrivateKey],
            now);

        var selected = Assert.Single(result);
        Assert.Equal(valid.Thumbprint, selected.Thumbprint);
        Assert.True(selected.HasPrivateKey);
    }

    [Fact]
    public void FilterUsable_requires_client_auth_when_eku_is_present()
    {
        var now = new DateTimeOffset(2026, 9, 8, 12, 0, 0, TimeSpan.Zero);
        using var clientAuth = CreateCertificate(
            now.AddDays(-1), now.AddDays(30), true, "CN=ClientAuth", [ClientAuthenticationOid]);
        using var codeSigningOnly = CreateCertificate(
            now.AddDays(-1), now.AddDays(30), true, "CN=CodeSigning", [CodeSigningOid]);
        using var noEku = CreateCertificate(
            now.AddDays(-1), now.AddDays(30), true, "CN=NoEku");

        var result = CertificateService.FilterUsable([clientAuth, codeSigningOnly, noEku], now);

        Assert.Equal(2, result.Count);
        Assert.Contains(result, certificate => certificate.Thumbprint == clientAuth.Thumbprint);
        Assert.Contains(result, certificate => certificate.Thumbprint == noEku.Thumbprint);
        Assert.DoesNotContain(result, certificate => certificate.Thumbprint == codeSigningOnly.Thumbprint);
    }

    [Fact]
    public void ToInfo_exposes_only_safe_metadata()
    {
        var now = new DateTimeOffset(2026, 9, 8, 12, 0, 0, TimeSpan.Zero);
        using var certificate = CreateCertificate(now.AddDays(-1), now.AddDays(30), true, "CN=Empresa Teste");

        var info = CertificateService.ToInfo(certificate);

        Assert.Equal(certificate.Thumbprint, info.Thumbprint);
        Assert.Equal(certificate.Subject, info.Subject);
        Assert.Equal(certificate.Issuer, info.Issuer);
        Assert.Equal(certificate.NotBefore, info.NotBefore);
        Assert.Equal(certificate.NotAfter, info.NotAfter);
    }

    [Fact]
    public async Task SelectAsync_persists_only_selected_thumbprint_and_recovers_selection()
    {
        var now = DateTimeOffset.UtcNow;
        using var certificate = CreateCertificate(
            now.AddDays(-1), now.AddDays(30), true, "CN=12345678000195, O=Empresa Teste, C=BR", [ClientAuthenticationOid]);
        using var temporary = new TemporaryDirectory();
        var settingsPath = Path.Combine(temporary.Path, "settings.json");
        var service = new CertificateService(settingsPath, () => [certificate]);

        await service.SelectAsync(certificate.Thumbprint!);

        var selected = service.GetSelected();
        Assert.NotNull(selected);
        Assert.Equal(certificate.Thumbprint, selected.Thumbprint);

        using var json = JsonDocument.Parse(await File.ReadAllTextAsync(settingsPath));
        var properties = json.RootElement.EnumerateObject().ToArray();
        var property = Assert.Single(properties);
        Assert.Equal("selectedThumbprint", property.Name);
        Assert.Equal(certificate.Thumbprint, property.Value.GetString());
    }

    [Fact]
    public async Task Invalid_stored_thumbprint_yields_no_selection()
    {
        var now = DateTimeOffset.UtcNow;
        using var certificate = CreateCertificate(now.AddDays(-1), now.AddDays(30), true, "CN=Empresa Teste");
        using var temporary = new TemporaryDirectory();
        var settingsPath = Path.Combine(temporary.Path, "settings.json");
        await File.WriteAllTextAsync(settingsPath, "{\"selectedThumbprint\":\"DEADBEEF\"}");
        var service = new CertificateService(settingsPath, () => [certificate]);

        Assert.Null(service.GetSelected());
    }

    [Fact]
    public void Certificate_identity_accepts_explicit_authority_state_when_subject_has_no_state()
    {
        var now = new DateTimeOffset(2026, 9, 8, 12, 0, 0, TimeSpan.Zero);
        using var certificate = CreateCertificate(
            now.AddDays(-1),
            now.AddDays(30),
            true,
            "CN=12345678000195, O=Empresa Teste, C=BR");

        var identity = CertificateIdentityReader.Read(certificate, "42");

        Assert.Equal("12345678000195", identity.Cnpj);
        Assert.Equal("42", identity.UfAutor);
    }

    [Fact]
    public void Certificate_identity_prefers_cnpj_suffix_from_common_name()
    {
        var now = new DateTimeOffset(2026, 9, 8, 12, 0, 0, TimeSpan.Zero);
        using var certificate = CreateCertificate(
            now.AddDays(-1),
            now.AddDays(30),
            true,
            "CN=PRADO SUPERMERCADO LTDA:09199938000157, OU=37279265000180, O=ICP-Brasil, C=BR");

        var identity = CertificateIdentityReader.Read(certificate, "42");

        Assert.Equal("09199938000157", identity.Cnpj);
        Assert.Equal("42", identity.UfAutor);
    }

    private static X509Certificate2 CreateCertificate(
        DateTimeOffset notBefore,
        DateTimeOffset notAfter,
        bool keepPrivateKey,
        string subject,
        string[]? enhancedKeyUsages = null)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest(subject, rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);

        if (enhancedKeyUsages is { Length: > 0 })
        {
            var oids = new OidCollection();
            foreach (var oid in enhancedKeyUsages)
            {
                oids.Add(new Oid(oid));
            }

            request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(oids, critical: false));
        }

        using var generated = request.CreateSelfSigned(notBefore, notAfter);

        if (keepPrivateKey)
        {
            return X509CertificateLoader.LoadPkcs12(
                generated.Export(X509ContentType.Pfx),
                password: null,
                keyStorageFlags: X509KeyStorageFlags.Exportable | X509KeyStorageFlags.EphemeralKeySet);
        }

        return X509CertificateLoader.LoadCertificate(generated.Export(X509ContentType.Cert));
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public TemporaryDirectory()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"nfe-bridge-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }
    }
}
