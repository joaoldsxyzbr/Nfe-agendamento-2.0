namespace NfeAgendamento.Bridge.Runtime;

public sealed class BridgeControlState
{
    private readonly object _gate = new();
    private readonly DateTimeOffset _startedAt;
    private readonly TimeSpan _initialLeaseTimeout;
    private readonly TimeSpan _leaseTimeout;
    private string? _leaseId;
    private DateTimeOffset? _lastHeartbeat;
    private bool _shutdownRequested;

    public BridgeControlState(
        BridgeControlIdentity identity,
        DateTimeOffset startedAt,
        TimeSpan initialLeaseTimeout,
        TimeSpan leaseTimeout)
    {
        Identity = identity ?? throw new ArgumentNullException(nameof(identity));
        if (initialLeaseTimeout <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(initialLeaseTimeout));
        if (leaseTimeout <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(leaseTimeout));

        _startedAt = startedAt;
        _initialLeaseTimeout = initialLeaseTimeout;
        _leaseTimeout = leaseTimeout;
    }

    public BridgeControlIdentity Identity { get; }

    public string? TryClaimLease(DateTimeOffset now)
    {
        lock (_gate)
        {
            if (!Identity.Managed || _shutdownRequested || _leaseId is not null)
                return null;
            if (now - _startedAt >= _initialLeaseTimeout)
                return null;

            _leaseId = Guid.NewGuid().ToString("N");
            _lastHeartbeat = now;
            return _leaseId;
        }
    }

    public bool Heartbeat(string leaseId, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(leaseId)) return false;

        lock (_gate)
        {
            if (_shutdownRequested || !string.Equals(_leaseId, leaseId, StringComparison.Ordinal))
                return false;

            _lastHeartbeat = now;
            return true;
        }
    }

    public bool RequestShutdown(string leaseId)
    {
        if (string.IsNullOrWhiteSpace(leaseId)) return false;

        lock (_gate)
        {
            if (!string.Equals(_leaseId, leaseId, StringComparison.Ordinal))
                return false;

            _shutdownRequested = true;
            return true;
        }
    }

    public bool ShouldStop(DateTimeOffset now)
    {
        lock (_gate)
        {
            if (!Identity.Managed)
                return false;
            if (_shutdownRequested)
                return true;
            if (_leaseId is null)
                return now - _startedAt >= _initialLeaseTimeout;

            return _lastHeartbeat is null || now - _lastHeartbeat.Value >= _leaseTimeout;
        }
    }
}
