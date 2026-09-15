using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace NfeAgendamento.Bridge.Fiscal;

public static class FiscalCoordinationCredential
{
    private static readonly byte[] Context = Encoding.UTF8.GetBytes(
        "nfe-agendamento:fiscal-coordination:v1");

    public static string Create(X509Certificate2 certificate)
    {
        ArgumentNullException.ThrowIfNull(certificate);

        try
        {
            using var rsa = certificate.GetRSAPrivateKey();
            if (rsa is null)
            {
                throw new FiscalCoordinationUnavailableException(
                    "O certificado selecionado não permite gerar a credencial segura de coordenação multi-PC.");
            }

            var signature = rsa.SignData(Context, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            var digest = SHA256.HashData(signature);
            return Base64UrlEncode(digest);
        }
        catch (FiscalCoordinationUnavailableException)
        {
            throw;
        }
        catch (Exception exception) when (exception is CryptographicException or NotSupportedException)
        {
            throw new FiscalCoordinationUnavailableException(
                "Não foi possível comprovar localmente a posse da chave privada para coordenação multi-PC.",
                exception);
        }
    }

    private static string Base64UrlEncode(ReadOnlySpan<byte> value) =>
        Convert.ToBase64String(value)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
}
