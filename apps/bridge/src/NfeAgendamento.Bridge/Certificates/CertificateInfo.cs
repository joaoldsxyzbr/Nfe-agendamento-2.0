namespace NfeAgendamento.Bridge.Certificates;

public sealed record CertificateInfo(
    string Subject,
    string Issuer,
    DateTime NotBefore,
    DateTime NotAfter,
    string Thumbprint);
