using System.Net;
using System.Security.Cryptography.X509Certificates;
using NfeAgendamento.Bridge.Certificates;

namespace NfeAgendamento.Bridge.Fiscal;

public sealed class NfeLookupService
{
    private readonly INfeDistributionTransport _transport;
    private readonly Func<X509Certificate2?> _getSelectedCertificate;

    public NfeLookupService(
        INfeDistributionTransport transport,
        Func<X509Certificate2?> getSelectedCertificate)
    {
        _transport = transport ?? throw new ArgumentNullException(nameof(transport));
        _getSelectedCertificate = getSelectedCertificate ?? throw new ArgumentNullException(nameof(getSelectedCertificate));
    }

    public async Task<LookupResult> LookupAsync(
        string accessKey,
        CancellationToken cancellationToken = default)
    {
        if (!AccessKey.TryParse(accessKey, out var parsed) || parsed is null)
        {
            return new LookupResult(
                LookupCategories.TechnicalError,
                null,
                null,
                "Chave NF-e inválida.");
        }

        using var certificate = _getSelectedCertificate();
        if (certificate is null)
        {
            return new LookupResult(
                LookupCategories.CertificateError,
                null,
                null,
                "Nenhum certificado A1 válido está selecionado neste computador.");
        }

        TransportResult response;
        try
        {
            response = await _transport.LookupAsync(
                parsed.Value,
                certificate,
                cancellationToken);
        }
        catch (CertificateIdentityException exception)
        {
            return new LookupResult(
                LookupCategories.CertificateError,
                null,
                null,
                exception.Message);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)
        {
            return new LookupResult(
                LookupCategories.ConsumptionLimit,
                null,
                null,
                "A SEFAZ recusou a consulta por excesso de requisições. A tentativa não será repetida automaticamente.");
        }
        catch (HttpRequestException)
        {
            return new LookupResult(
                LookupCategories.TransportUnavailable,
                null,
                null,
                "Não foi possível confirmar o resultado da comunicação com a SEFAZ. A tentativa não será repetida automaticamente.");
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new LookupResult(
                LookupCategories.TransportUnavailable,
                null,
                null,
                "A consulta à SEFAZ excedeu o tempo limite. A tentativa não será repetida automaticamente.");
        }
        catch (InvalidDataException)
        {
            return new LookupResult(
                LookupCategories.TechnicalError,
                null,
                null,
                "A resposta recebida da SEFAZ não pôde ser validada com segurança.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return new LookupResult(
                LookupCategories.TechnicalError,
                null,
                null,
                "Ocorreu uma falha técnica ao consultar a NF-e.");
        }

        if (string.Equals(response.CStat, "656", StringComparison.Ordinal))
        {
            return new LookupResult(
                LookupCategories.ConsumptionLimit,
                null,
                response.CStat,
                response.Message);
        }

        if (string.Equals(response.CStat, "138", StringComparison.Ordinal))
        {
            if (string.IsNullOrWhiteSpace(response.Xml))
            {
                return new LookupResult(
                    LookupCategories.FiscalStatus,
                    null,
                    response.CStat,
                    response.Message);
            }

            return new LookupResult(
                LookupCategories.Success,
                response.Xml,
                response.CStat,
                response.Message);
        }

        return new LookupResult(
            LookupCategories.FiscalStatus,
            null,
            response.CStat,
            response.Message);
    }
}
