namespace NfeAgendamento.App.Runtime;

public sealed class BridgeRestartPolicy
{
    private static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(2),
        TimeSpan.FromSeconds(5),
    ];

    private readonly TimeSpan _circuitCooldown;
    private int _failureCount;
    private DateTimeOffset? _circuitOpenUntil;

    public BridgeRestartPolicy(TimeSpan circuitCooldown)
    {
        if (circuitCooldown <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(circuitCooldown));

        _circuitCooldown = circuitCooldown;
    }

    public TimeSpan? RegisterFailure(DateTimeOffset now)
    {
        ResetExpiredCircuit(now);
        if (_circuitOpenUntil is not null)
            return null;

        if (_failureCount < Backoff.Length)
            return Backoff[_failureCount++];

        _circuitOpenUntil = now.Add(_circuitCooldown);
        return null;
    }

    public void RegisterHealthy()
    {
        _failureCount = 0;
        _circuitOpenUntil = null;
    }

    public bool IsCircuitOpen(DateTimeOffset now)
    {
        ResetExpiredCircuit(now);
        return _circuitOpenUntil is not null;
    }

    public bool CanAttempt(DateTimeOffset now) => !IsCircuitOpen(now);

    private void ResetExpiredCircuit(DateTimeOffset now)
    {
        if (_circuitOpenUntil is null || now < _circuitOpenUntil.Value)
            return;

        _failureCount = 0;
        _circuitOpenUntil = null;
    }
}
