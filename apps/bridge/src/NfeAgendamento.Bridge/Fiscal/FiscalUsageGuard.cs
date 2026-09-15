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
            var stateChanged = PruneGlobalBlock(now);

            if (_state.GlobalBlockedUntilUtc is { } globalBlockedUntil && globalBlockedUntil > now)
            {
                if (stateChanged) SaveState();
                return new FiscalUsageDecision(false, globalBlockedUntil, "state_recovery");
            }

            var entry = GetOrCreate(identity);
            var changed = Prune(entry, now) || stateChanged;

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
            PruneGlobalBlock(now);
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
            PruneGlobalBlock(now);
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

    private bool PruneGlobalBlock(DateTimeOffset now)
    {
        if (_state.GlobalBlockedUntilUtc is not { } blockedUntil || blockedUntil > now) return false;
        _state.GlobalBlockedUntilUtc = null;
        return true;
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
            return JsonSerializer.Deserialize<FiscalUsageState>(json) ?? throw new JsonException("Estado fiscal vazio.");
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            // Falhar aberto poderia repetir uma consulta e estender um bloqueio 656. Em caso de
            // estado ilegível, usa Portal por uma janela e regrava um estado mínimo recuperável.
            var recoveryState = new FiscalUsageState
            {
                GlobalBlockedUntilUtc = _utcNow() + ConsumptionWindow,
            };

            TryPersistRecoveryState(recoveryState);
            return recoveryState;
        }
    }

    private void TryPersistRecoveryState(FiscalUsageState state)
    {
        if (_statePath is null) return;
        try
        {
            WriteStateDurably(_statePath, state);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // O processo atual continua protegido pelo estado em memória. Uma próxima inicialização
            // também tentará falhar de forma conservadora enquanto o arquivo permanecer ilegível.
        }
    }

    private void SaveState()
    {
        if (_statePath is null) return;
        WriteStateDurably(_statePath, _state);
    }

    private static void WriteStateDurably(string statePath, FiscalUsageState state)
    {
        var directory = Path.GetDirectoryName(statePath);
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);

        var json = JsonSerializer.Serialize(state);
        var temporaryPath = $"{statePath}.{Environment.ProcessId}.{Guid.NewGuid():N}.tmp";
        try
        {
            using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 4096,
                FileOptions.WriteThrough))
            using (var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), leaveOpen: true))
            {
                writer.Write(json);
                writer.Flush();
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporaryPath, statePath, overwrite: true);
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
        public int Version { get; set; } = 2;
        public DateTimeOffset? GlobalBlockedUntilUtc { get; set; }
        public Dictionary<string, FiscalUsageEntry> Identities { get; set; } = new(StringComparer.Ordinal);
    }

    public sealed class FiscalUsageEntry
    {
        public List<DateTimeOffset> AttemptsUtc { get; set; } = [];
        public DateTimeOffset? BlockedUntilUtc { get; set; }
    }
}
