using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NfeAgendamento.Bridge.Fiscal;

public sealed record FiscalUsageDecision(
    bool AllowDirectLookup,
    DateTimeOffset? BlockedUntilUtc,
    string? Reason);

public sealed class FiscalUsageGuard
{
    public const int MaxDirectAttemptsPerHour = 20;
    public static readonly TimeSpan ConsumptionWindow = TimeSpan.FromHours(1);

    private readonly string? _statePath;
    private readonly Func<DateTimeOffset> _utcNow;
    private readonly object _sync = new();
    private FiscalUsageState _state;

    public FiscalUsageGuard(string? statePath = null, Func<DateTimeOffset>? utcNow = null)
    {
        _statePath = string.IsNullOrWhiteSpace(statePath) ? null : Path.GetFullPath(statePath);
        _utcNow = utcNow ?? (() => DateTimeOffset.UtcNow);
        _state = LoadState();
    }

    public SemaphoreSlim Gate { get; } = new(1, 1);

    public static FiscalUsageGuard CreateDefault()
    {
        var basePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NfeAgendamentoBridge");
        return new FiscalUsageGuard(Path.Combine(basePath, "fiscal-usage.json"));
    }

    public static FiscalUsageGuard CreateEphemeral() => new();

    public FiscalUsageDecision Check(string cnpj)
    {
        var identity = HashIdentity(cnpj);
        lock (_sync)
        {
            var now = _utcNow();
            var entry = GetOrCreate(identity);
            var changed = Prune(entry, now);

            if (entry.BlockedUntilUtc is { } blockedUntil && blockedUntil > now)
            {
                if (changed) SaveState();
                return new FiscalUsageDecision(false, blockedUntil, "cooldown");
            }

            if (entry.AttemptsUtc.Count >= MaxDirectAttemptsPerHour)
            {
                var oldest = entry.AttemptsUtc.Min();
                var localLimitUntil = oldest + ConsumptionWindow;
                entry.BlockedUntilUtc = localLimitUntil;
                SaveState();
                return new FiscalUsageDecision(false, localLimitUntil, "local_limit");
            }

            if (changed) SaveState();
            return new FiscalUsageDecision(true, null, null);
        }
    }

    public void RecordAttempt(string cnpj)
    {
        var identity = HashIdentity(cnpj);
        lock (_sync)
        {
            var now = _utcNow();
            var entry = GetOrCreate(identity);
            Prune(entry, now);
            entry.AttemptsUtc.Add(now);
            SaveState();
        }
    }

    public DateTimeOffset Block(string cnpj, TimeSpan? duration = null)
    {
        var identity = HashIdentity(cnpj);
        lock (_sync)
        {
            var now = _utcNow();
            var blockedUntil = now + (duration ?? ConsumptionWindow);
            var entry = GetOrCreate(identity);
            Prune(entry, now);
            entry.BlockedUntilUtc = blockedUntil;
            SaveState();
            return blockedUntil;
        }
    }

    private FiscalUsageEntry GetOrCreate(string identity)
    {
        if (_state.Identities.TryGetValue(identity, out var existing)) return existing;
        var created = new FiscalUsageEntry();
        _state.Identities[identity] = created;
        return created;
    }

    private static bool Prune(FiscalUsageEntry entry, DateTimeOffset now)
    {
        var cutoff = now - ConsumptionWindow;
        var removed = entry.AttemptsUtc.RemoveAll(timestamp => timestamp <= cutoff) > 0;
        if (entry.BlockedUntilUtc is { } blockedUntil && blockedUntil <= now)
        {
            entry.BlockedUntilUtc = null;
            removed = true;
        }
        return removed;
    }

    private FiscalUsageState LoadState()
    {
        if (_statePath is null || !File.Exists(_statePath)) return new FiscalUsageState();

        try
        {
            var json = File.ReadAllText(_statePath, Encoding.UTF8);
            return JsonSerializer.Deserialize<FiscalUsageState>(json) ?? new FiscalUsageState();
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return new FiscalUsageState();
        }
    }

    private void SaveState()
    {
        if (_statePath is null) return;

        var directory = Path.GetDirectoryName(_statePath);
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);

        var json = JsonSerializer.Serialize(_state);
        var temporaryPath = $"{_statePath}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
        try
        {
            File.WriteAllText(temporaryPath, json, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            File.Move(temporaryPath, _statePath, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    private static string HashIdentity(string cnpj)
    {
        if (string.IsNullOrWhiteSpace(cnpj)) throw new ArgumentException("CNPJ não informado.", nameof(cnpj));
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes(cnpj.Trim()));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    public sealed class FiscalUsageState
    {
        public int Version { get; set; } = 1;
        public Dictionary<string, FiscalUsageEntry> Identities { get; set; } = new(StringComparer.Ordinal);
    }

    public sealed class FiscalUsageEntry
    {
        public List<DateTimeOffset> AttemptsUtc { get; set; } = [];
        public DateTimeOffset? BlockedUntilUtc { get; set; }
    }
}
