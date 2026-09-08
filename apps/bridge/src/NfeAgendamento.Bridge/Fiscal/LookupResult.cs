namespace NfeAgendamento.Bridge.Fiscal;

public static class LookupCategories
{
    public const string Success = "success";
    public const string FiscalStatus = "fiscal_status";
    public const string ConsumptionLimit = "consumption_limit";
    public const string CertificateError = "certificate_error";
    public const string TransportUnavailable = "transport_unavailable";
    public const string TechnicalError = "technical_error";
}

public sealed record LookupResult(
    string Category,
    string? Xml,
    string? CStat,
    string? Message);
