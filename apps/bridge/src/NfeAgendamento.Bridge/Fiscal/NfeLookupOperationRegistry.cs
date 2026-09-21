namespace NfeAgendamento.Bridge.Fiscal;

public sealed class NfeLookupRequestConflictException : InvalidOperationException
{
    public NfeLookupRequestConflictException()
        : base("O requestId informado já está associado a outra chave NF-e.")
    {
    }
}

public sealed class NfeLookupRegistryFullException : InvalidOperationException
{
    public NfeLookupRegistryFullException()
        : base("O registro local de consultas está temporariamente cheio.")
    {
    }
}

public sealed class NfeLookupOperationRegistry
{
    private static readonly TimeSpan DefaultTerminalTtl = TimeSpan.FromMinutes(2);
    private const int DefaultMaxEntries = 256;

    private readonly object _gate = new();
    private readonly Dictionary<string, RequestEntry> _requests = new(StringComparer.Ordinal);
    private readonly Dictionary<string, OperationEntry> _inflightByAccessKey = new(StringComparer.Ordinal);
    private readonly Func<DateTimeOffset> _clock;
    private readonly TimeSpan _terminalTtl;
    private readonly int _maxEntries;

    public NfeLookupOperationRegistry(
        Func<DateTimeOffset>? clock = null,
        TimeSpan? terminalTtl = null,
        int maxEntries = DefaultMaxEntries)
    {
        _clock = clock ?? (() => DateTimeOffset.UtcNow);
        _terminalTtl = terminalTtl ?? DefaultTerminalTtl;
        _maxEntries = maxEntries;

        if (_terminalTtl <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(terminalTtl));

        if (_maxEntries <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxEntries));
    }

    public Task<LookupResult> ExecuteAsync(
        string requestId,
        string accessKey,
        Func<Task<LookupResult>> factory)
    {
        if (string.IsNullOrWhiteSpace(requestId))
            throw new ArgumentException("requestId obrigatório.", nameof(requestId));

        if (string.IsNullOrWhiteSpace(accessKey))
            throw new ArgumentException("Chave NF-e obrigatória.", nameof(accessKey));

        ArgumentNullException.ThrowIfNull(factory);

        OperationEntry? operationToStart = null;
        Task<LookupResult> task;

        lock (_gate)
        {
            CleanupExpiredLocked(_clock());

            if (_requests.TryGetValue(requestId, out var existingRequest))
            {
                if (!string.Equals(existingRequest.AccessKey, accessKey, StringComparison.Ordinal))
                    throw new NfeLookupRequestConflictException();

                return existingRequest.Operation.Task;
            }

            if (_requests.Count >= _maxEntries)
                throw new NfeLookupRegistryFullException();

            if (_inflightByAccessKey.TryGetValue(accessKey, out var inflight))
            {
                inflight.RequestIds.Add(requestId);
                _requests.Add(requestId, new RequestEntry(accessKey, inflight));
                return inflight.Task;
            }

            var completion = new TaskCompletionSource<LookupResult>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            var operation = new OperationEntry(accessKey, completion);
            operation.RequestIds.Add(requestId);

            _inflightByAccessKey.Add(accessKey, operation);
            _requests.Add(requestId, new RequestEntry(accessKey, operation));

            operationToStart = operation;
            task = operation.Task;
        }

        _ = RunFactoryAsync(operationToStart, factory);
        return task;
    }

    private async Task RunFactoryAsync(
        OperationEntry operation,
        Func<Task<LookupResult>> factory)
    {
        try
        {
            var result = await factory();
            MarkTerminal(operation);
            operation.Completion.TrySetResult(result);
        }
        catch (OperationCanceledException exception)
        {
            RemoveOperation(operation);
            operation.Completion.TrySetCanceled(exception.CancellationToken);
        }
        catch (Exception exception)
        {
            RemoveOperation(operation);
            operation.Completion.TrySetException(exception);
        }
    }

    private void MarkTerminal(OperationEntry operation)
    {
        lock (_gate)
        {
            if (_inflightByAccessKey.TryGetValue(operation.AccessKey, out var current) &&
                ReferenceEquals(current, operation))
            {
                _inflightByAccessKey.Remove(operation.AccessKey);
            }

            var expiresAt = _clock().Add(_terminalTtl);
            foreach (var requestId in operation.RequestIds)
            {
                if (_requests.TryGetValue(requestId, out var entry) &&
                    ReferenceEquals(entry.Operation, operation))
                {
                    entry.ExpiresAt = expiresAt;
                }
            }
        }
    }

    private void RemoveOperation(OperationEntry operation)
    {
        lock (_gate)
        {
            if (_inflightByAccessKey.TryGetValue(operation.AccessKey, out var current) &&
                ReferenceEquals(current, operation))
            {
                _inflightByAccessKey.Remove(operation.AccessKey);
            }

            foreach (var requestId in operation.RequestIds)
            {
                if (_requests.TryGetValue(requestId, out var entry) &&
                    ReferenceEquals(entry.Operation, operation))
                {
                    _requests.Remove(requestId);
                }
            }
        }
    }

    private void CleanupExpiredLocked(DateTimeOffset now)
    {
        if (_requests.Count == 0)
            return;

        var expired = _requests
            .Where(pair => pair.Value.ExpiresAt is { } expiresAt && expiresAt <= now)
            .Select(pair => pair.Key)
            .ToArray();

        foreach (var requestId in expired)
            _requests.Remove(requestId);
    }

    private sealed class RequestEntry(string accessKey, OperationEntry operation)
    {
        public string AccessKey { get; } = accessKey;
        public OperationEntry Operation { get; } = operation;
        public DateTimeOffset? ExpiresAt { get; set; }
    }

    private sealed class OperationEntry(
        string accessKey,
        TaskCompletionSource<LookupResult> completion)
    {
        public string AccessKey { get; } = accessKey;
        public TaskCompletionSource<LookupResult> Completion { get; } = completion;
        public Task<LookupResult> Task => Completion.Task;
        public List<string> RequestIds { get; } = [];
    }
}
