using System.Text.Json;
using Microsoft.Extensions.Logging;
using NfeAgendamento.Bridge.Runtime;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class LocalJsonFileLoggerProviderTests : IDisposable
{
    private readonly string _directory = Path.Combine(
        Path.GetTempPath(),
        $"nfe-bridge-logs-{Guid.NewGuid():N}");

    [Fact]
    public void Writes_json_lines_without_persisting_exception_details()
    {
        using var provider = new LocalJsonFileLoggerProvider(new LocalJsonFileLoggerOptions(
            _directory,
            1024 * 1024,
            2,
            LogLevel.Information));
        var logger = provider.CreateLogger("NfeAgendamento.Tests");

        logger.LogError(
            new EventId(42, "SafeFailure"),
            new InvalidOperationException("segredo-que-nao-pode-ir-ao-log"),
            "Falha genérica de teste.");

        var activePath = Path.Combine(_directory, "bridge.log");
        var line = Assert.Single(File.ReadAllLines(activePath));
        Assert.DoesNotContain("segredo-que-nao-pode-ir-ao-log", line, StringComparison.Ordinal);

        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        Assert.Equal("Error", root.GetProperty("level").GetString());
        Assert.Equal("NfeAgendamento.Tests", root.GetProperty("category").GetString());
        Assert.Equal(42, root.GetProperty("eventId").GetInt32());
        Assert.Equal("Falha genérica de teste.", root.GetProperty("message").GetString());
        Assert.Equal(
            typeof(InvalidOperationException).FullName,
            root.GetProperty("exceptionType").GetString());
        Assert.True(root.GetProperty("timestampUtc").GetDateTimeOffset() <= DateTimeOffset.UtcNow);
    }

    [Fact]
    public void Rotates_by_size_and_keeps_only_configured_archives()
    {
        using var provider = new LocalJsonFileLoggerProvider(new LocalJsonFileLoggerOptions(
            _directory,
            220,
            2,
            LogLevel.Information));
        var logger = provider.CreateLogger("Rotation");

        for (var index = 0; index < 12; index++)
        {
            logger.LogInformation(new EventId(index), "Registro {Index} com conteúdo suficiente para rotação.", index);
        }

        Assert.True(File.Exists(Path.Combine(_directory, "bridge.log")));
        Assert.True(File.Exists(Path.Combine(_directory, "bridge.1.log")));
        Assert.True(File.Exists(Path.Combine(_directory, "bridge.2.log")));
        Assert.False(File.Exists(Path.Combine(_directory, "bridge.3.log")));

        foreach (var file in Directory.GetFiles(_directory, "bridge*.log"))
        {
            foreach (var line in File.ReadLines(file))
            {
                using var document = JsonDocument.Parse(line);
                Assert.True(document.RootElement.TryGetProperty("message", out _));
            }
        }
    }

    [Fact]
    public void Respects_minimum_level()
    {
        using var provider = new LocalJsonFileLoggerProvider(new LocalJsonFileLoggerOptions(
            _directory,
            1024,
            1,
            LogLevel.Warning));
        var logger = provider.CreateLogger("Levels");

        logger.LogInformation("Não deve ser persistido.");
        logger.LogWarning("Deve ser persistido.");

        var lines = File.ReadAllLines(Path.Combine(_directory, "bridge.log"));
        var line = Assert.Single(lines);
        Assert.DoesNotContain("Não deve ser persistido", line, StringComparison.Ordinal);
        Assert.Contains("Deve ser persistido", line, StringComparison.Ordinal);
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(_directory))
            {
                Directory.Delete(_directory, recursive: true);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
        }
    }
}
