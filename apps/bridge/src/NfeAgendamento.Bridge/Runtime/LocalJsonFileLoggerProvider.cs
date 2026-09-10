using System.Security;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace NfeAgendamento.Bridge.Runtime;

public sealed record LocalJsonFileLoggerOptions(
    string DirectoryPath,
    long MaxFileBytes,
    int MaxArchiveFiles,
    LogLevel MinimumLevel)
{
    public static LocalJsonFileLoggerOptions CreateDefault() => new(
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NfeAgendamentoBridge",
            "logs"),
        2L * 1024 * 1024,
        4,
        LogLevel.Information);
}

public sealed class LocalJsonFileLoggerProvider : ILoggerProvider
{
    private static readonly Encoding Utf8NoBom = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly object _sync = new();
    private readonly LocalJsonFileLoggerOptions _options;
    private readonly string _activePath;
    private bool _disposed;

    public LocalJsonFileLoggerProvider(LocalJsonFileLoggerOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        if (string.IsNullOrWhiteSpace(options.DirectoryPath))
        {
            throw new ArgumentException("Diretório de log inválido.", nameof(options));
        }

        if (options.MaxFileBytes <= 0)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "O limite do arquivo de log deve ser positivo.");
        }

        if (options.MaxArchiveFiles < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(options), "A quantidade de arquivos de histórico não pode ser negativa.");
        }

        _options = options with { DirectoryPath = Path.GetFullPath(options.DirectoryPath) };
        _activePath = Path.Combine(_options.DirectoryPath, "bridge.log");
    }

    public ILogger CreateLogger(string categoryName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(categoryName);
        return new LocalJsonFileLogger(this, categoryName);
    }

    public void Dispose()
    {
        lock (_sync)
        {
            _disposed = true;
        }

        GC.SuppressFinalize(this);
    }

    internal bool IsEnabled(LogLevel level) =>
        !_disposed && level != LogLevel.None && level >= _options.MinimumLevel;

    internal void Write(
        LogLevel level,
        EventId eventId,
        string category,
        string message,
        Exception? exception)
    {
        if (!IsEnabled(level))
        {
            return;
        }

        try
        {
            var entry = new LocalLogEntry(
                DateTimeOffset.UtcNow,
                level.ToString(),
                category,
                eventId.Id,
                message,
                exception?.GetType().FullName);
            var line = JsonSerializer.Serialize(entry, JsonOptions) + Environment.NewLine;
            var incomingBytes = Utf8NoBom.GetByteCount(line);

            lock (_sync)
            {
                if (_disposed)
                {
                    return;
                }

                Directory.CreateDirectory(_options.DirectoryPath);
                RotateIfNeeded(incomingBytes);
                File.AppendAllText(_activePath, line, Utf8NoBom);
            }
        }
        catch (Exception writeException) when (
            writeException is IOException
            or UnauthorizedAccessException
            or SecurityException
            or ArgumentException
            or NotSupportedException)
        {
            // Logging local é best-effort e nunca deve interromper o Bridge.
        }
    }

    private void RotateIfNeeded(int incomingBytes)
    {
        if (!File.Exists(_activePath) ||
            new FileInfo(_activePath).Length + incomingBytes <= _options.MaxFileBytes)
        {
            return;
        }

        if (_options.MaxArchiveFiles == 0)
        {
            File.Delete(_activePath);
            return;
        }

        var oldestArchive = ArchivePath(_options.MaxArchiveFiles);
        if (File.Exists(oldestArchive))
        {
            File.Delete(oldestArchive);
        }

        for (var index = _options.MaxArchiveFiles - 1; index >= 1; index--)
        {
            var source = ArchivePath(index);
            if (File.Exists(source))
            {
                File.Move(source, ArchivePath(index + 1), overwrite: true);
            }
        }

        File.Move(_activePath, ArchivePath(1), overwrite: true);
    }

    private string ArchivePath(int index) =>
        Path.Combine(_options.DirectoryPath, $"bridge.{index}.log");

    private sealed record LocalLogEntry(
        DateTimeOffset TimestampUtc,
        string Level,
        string Category,
        int EventId,
        string Message,
        string? ExceptionType);

    private sealed class LocalJsonFileLogger : ILogger
    {
        private readonly LocalJsonFileLoggerProvider _provider;
        private readonly string _categoryName;

        public LocalJsonFileLogger(LocalJsonFileLoggerProvider provider, string categoryName)
        {
            _provider = provider;
            _categoryName = categoryName;
        }

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => NoopScope.Instance;

        public bool IsEnabled(LogLevel logLevel) => _provider.IsEnabled(logLevel);

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            ArgumentNullException.ThrowIfNull(formatter);

            if (!IsEnabled(logLevel))
            {
                return;
            }

            var message = formatter(state, exception);
            if (string.IsNullOrWhiteSpace(message) && exception is null)
            {
                return;
            }

            _provider.Write(logLevel, eventId, _categoryName, message, exception);
        }
    }

    private sealed class NoopScope : IDisposable
    {
        public static NoopScope Instance { get; } = new();

        public void Dispose()
        {
        }
    }
}
