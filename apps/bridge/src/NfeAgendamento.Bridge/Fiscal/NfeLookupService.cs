using System.Net;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Extensions.Logging;
using NfeAgendamento.Bridge.Certificates;

namespace NfeAgendamento.Bridge.Fiscal;

public sealed class NfeLookupService
{
    private readonly INfeDistributionTransport _transport;
    private readonly Func<X509Certificate2?> _getSelectedCertificate;
    private readonly FiscalUsageGuard _usageGuard;
    private readonly IFiscalUsageCoordinator _sharedCoordinator;
    private readonly ILogger<NfeLookupService>? _logger;

    public NfeLookupService(
        INfeDistributionTransport transport,
        Func<X509Certificate2?> getSelectedCertificate,
        ILogger<NfeLookupService>? logger = null)
        : this(
            transport,
            getSelectedCertificate,
            FiscalUsageGuard.CreateEphemeral(),
            DisabledFiscalUsageCoordinator.Instance,
            logger)
    {
    }

    public NfeLookupService(
        INfeDistributionTransport transport,
        Func<X509Certificate2?> getSelectedCertificate,
        FiscalUsageGuard usageGuard,
        ILogger<NfeLookupService>? logger = null)
        : this(
            transport,
            getSelectedCertificate,
            usageGuard,
            DisabledFiscalUsageCoordinator.Instance,
            logger)
    {
    }

    public NfeLookupService(
        INfeDistributionTransport transport,
        Func<X509Certificate2?> getSelectedCertificate,
        FiscalUsageGuard usageGuard,
        IFiscalUsageCoordinator sharedCoordinator,
        ILogger<NfeLookupService>? logger = null)
    {
        _transport = transport ?? throw new ArgumentNullException(nameof(transport));
        _getSelectedCertificate = getSelectedCertificate ?? throw new ArgumentNullException(nameof(getSelectedCertificate));
        _usageGuard = usageGuard ?? throw new ArgumentNullException(nameof(usageGuard));
        _sharedCoordinator = sharedCoordinator ?? throw new ArgumentNullException(nameof(sharedCoordinator));
        _logger = logger;
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

        string cnpj;
        try
        {
            cnpj = CertificateIdentityReader.ReadCnpj(certificate);
        }
        catch (CertificateIdentityException exception)
        {
            _logger?.LogWarning(
                new EventId(1001, "CertificateIdentityFailure"),
                "Falha ao validar a identidade fiscal do certificado selecionado.");
            return new LookupResult(
                LookupCategories.CertificateError,
                null,
                null,
                exception.Message);
        }

        await _usageGuard.Gate.WaitAsync(cancellationToken);
        try
        {
            var decision = _usageGuard.Check(cnpj);
            if (!decision.AllowDirectLookup)
            {
                var localTime = decision.BlockedUntilUtc?.ToLocalTime().ToString("HH:mm") ?? "mais tarde";
                return new LookupResult(
                    LookupCategories.ConsumptionLimit,
                    null,
                    null,
                    $"Proteção fiscal local ativa até {localTime}. A SEFAZ não foi consultada novamente.");
            }

            FiscalCoordinationDecision sharedDecision;
            try
            {
                sharedDecision = await _sharedCoordinator.ReserveAsync(certificate, cancellationToken);
            }
            catch (FiscalCoordinationUnavailableException)
            {
                _logger?.LogWarning(
                    new EventId(1008, "SharedFiscalCoordinationUnavailable"),
                    "Coordenação fiscal multi-PC indisponível; consulta direta à SEFAZ foi bloqueada de forma conservadora.");
                return new LookupResult(
                    LookupCategories.ConsumptionLimit,
                    null,
                    null,
                    "A proteção fiscal compartilhada entre os computadores está indisponível. A SEFAZ não foi consultada; use o Portal até a coordenação ser restabelecida.");
            }

            if (!sharedDecision.AllowDirectLookup)
            {
                var localTime = sharedDecision.BlockedUntilUtc?.ToLocalTime().ToString("HH:mm") ?? "mais tarde";
                return new LookupResult(
                    LookupCategories.ConsumptionLimit,
                    null,
                    null,
                    $"Proteção fiscal compartilhada ativa até {localTime}. A SEFAZ não foi consultada novamente por este computador.");
            }

            // A reserva compartilhada é feita antes da rede fiscal. Se a comunicação seguinte ficar
            // ambígua, a tentativa continua contabilizada de forma conservadora nos demais PCs.
            _usageGuard.RecordAttempt(cnpj);

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
                _logger?.LogWarning(
                    new EventId(1001, "CertificateIdentityFailure"),
                    "Falha ao validar a identidade fiscal do certificado selecionado.");
                return new LookupResult(
                    LookupCategories.CertificateError,
                    null,
                    null,
                    exception.Message);
            }
            catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.TooManyRequests)
            {
                _usageGuard.Block(cnpj);
                await BlockSharedSafelyAsync(certificate);
                _logger?.LogWarning(
                    new EventId(1002, "SefazRateLimited"),
                    "A SEFAZ recusou a consulta por excesso de requisições.");
                return new LookupResult(
                    LookupCategories.ConsumptionLimit,
                    null,
                    null,
                    "A SEFAZ recusou a consulta por excesso de requisições. A tentativa não será repetida automaticamente.");
            }
            catch (HttpRequestException)
            {
                _logger?.LogWarning(
                    new EventId(1003, "SefazTransportFailure"),
                    "Falha de transporte durante comunicação com a SEFAZ.");
                return new LookupResult(
                    LookupCategories.TransportUnavailable,
                    null,
                    null,
                    "Não foi possível confirmar o resultado da comunicação com a SEFAZ. A tentativa não será repetida automaticamente.");
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                _logger?.LogWarning(
                    new EventId(1004, "SefazTimeout"),
                    "A comunicação com a SEFAZ excedeu o tempo limite.");
                return new LookupResult(
                    LookupCategories.TransportUnavailable,
                    null,
                    null,
                    "A consulta à SEFAZ excedeu o tempo limite. A tentativa não será repetida automaticamente.");
            }
            catch (InvalidDataException)
            {
                _logger?.LogWarning(
                    new EventId(1005, "InvalidSefazResponse"),
                    "A resposta da SEFAZ falhou na validação local.");
                return new LookupResult(
                    LookupCategories.TechnicalError,
                    null,
                    null,
                    "A resposta recebida da SEFAZ não pôde ser validada com segurança.");
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger?.LogError(
                    new EventId(1006, "UnexpectedLookupFailure"),
                    "Falha técnica inesperada durante a consulta NF-e ({ExceptionType}).",
                    ex.GetType().FullName ?? ex.GetType().Name);
                return new LookupResult(
                    LookupCategories.TechnicalError,
                    null,
                    null,
                    "Ocorreu uma falha técnica ao consultar a NF-e.");
            }

            if (string.Equals(response.CStat, "656", StringComparison.Ordinal))
            {
                _usageGuard.Block(cnpj);
                await BlockSharedSafelyAsync(certificate);
                _logger?.LogWarning(
                    new EventId(1007, "SefazConsumptionLimit"),
                    "A SEFAZ retornou limite de consumo para a consulta.");
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
        finally
        {
            _usageGuard.Gate.Release();
        }
    }

    private async Task BlockSharedSafelyAsync(X509Certificate2 certificate)
    {
        try
        {
            await _sharedCoordinator.BlockAsync(certificate, CancellationToken.None);
        }
        catch (FiscalCoordinationUnavailableException)
        {
            _logger?.LogWarning(
                new EventId(1009, "SharedFiscalBlockPropagationFailure"),
                "Não foi possível propagar imediatamente o bloqueio fiscal para os demais computadores.");
        }
    }
}
