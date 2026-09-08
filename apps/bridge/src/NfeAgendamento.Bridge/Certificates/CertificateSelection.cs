namespace NfeAgendamento.Bridge.Certificates;

public sealed record CertificateSelection(
    string Thumbprint,
    string Subject,
    DateTime NotAfter);
