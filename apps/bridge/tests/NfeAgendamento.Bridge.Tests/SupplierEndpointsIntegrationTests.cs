using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using NfeAgendamento.Bridge.Suppliers;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class SupplierEndpointsIntegrationTests : IAsyncDisposable
{
    private const string AllowedOrigin = "https://nfeagendamento.example";
    private const string SyntheticTaxId = "12.345.678/0001-95";
    private const string SyntheticNormalizedTaxId = "12345678000195";

    private readonly string _temporaryRoot;
    private readonly CapturingLoggerProvider _logs = new();
    private readonly WebApplicationFactory<Program> _factory;

    public SupplierEndpointsIntegrationTests()
    {
        _temporaryRoot = Path.Combine(Path.GetTempPath(), $"nfe-supplier-endpoints-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_temporaryRoot);
        var rulesPath = Path.Combine(_temporaryRoot, "supplier-rules.json");
        File.WriteAllText(rulesPath, """
        {"version":1,"suppliers":[{"id":"souza-cruz","taxIds":["12.345.678/0001-95"]}]}
        """);
        var resolver = new SupplierIdentityResolver(rulesPath);

        _factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Production");
                builder.ConfigureAppConfiguration((_, configuration) =>
                {
                    configuration.AddInMemoryCollection(new Dictionary<string, string?>
                    {
                        ["Bridge:AllowedOrigins:0"] = AllowedOrigin,
                    });
                });
                builder.ConfigureLogging(logging => logging.AddProvider(_logs));
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<SupplierIdentityResolver>();
                    services.AddSingleton(resolver);
                });
            });
    }

    [Fact]
    public async Task Supplier_resolve_returns_only_logical_id()
    {
        using var client = CreateClient();
        using var request = Request(HttpMethod.Post, "/api/v1/supplier/resolve");
        request.Content = JsonContent.Create(new { taxId = SyntheticTaxId });

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var payload = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("souza-cruz", payload.RootElement.GetProperty("supplierId").GetString());
        Assert.Single(payload.RootElement.EnumerateObject());
        Assert.DoesNotContain(SyntheticNormalizedTaxId, payload.RootElement.GetRawText(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("11.111.111/1111-11")]
    [InlineData("invalido")]
    public async Task Supplier_resolve_returns_null_for_unknown_or_invalid_tax_id(string taxId)
    {
        using var client = CreateClient();
        using var request = Request(HttpMethod.Post, "/api/v1/supplier/resolve");
        request.Content = JsonContent.Create(new { taxId });

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        var payload = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(JsonValueKind.Null, payload.GetProperty("supplierId").ValueKind);
    }

    [Fact]
    public async Task Supplier_resolve_rejects_untrusted_origin()
    {
        using var client = CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/supplier/resolve");
        request.Headers.Host = "127.0.0.1:17345";
        request.Headers.Add("Origin", "https://invalid.example");
        request.Content = JsonContent.Create(new { taxId = SyntheticTaxId });

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Supplier_resolve_does_not_write_tax_id_to_logs()
    {
        using var client = CreateClient();
        using var request = Request(HttpMethod.Post, "/api/v1/supplier/resolve");
        request.Content = JsonContent.Create(new { taxId = SyntheticTaxId });

        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        _ = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        foreach (var message in _logs.Messages)
        {
            Assert.DoesNotContain(SyntheticNormalizedTaxId, message, StringComparison.Ordinal);
            Assert.DoesNotContain(SyntheticTaxId, message, StringComparison.Ordinal);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        _logs.Dispose();
        try
        {
            Directory.Delete(_temporaryRoot, recursive: true);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }

        GC.SuppressFinalize(this);
    }

    private HttpClient CreateClient() => _factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("http://127.0.0.1:17345"),
        AllowAutoRedirect = false,
    });

    private static HttpRequestMessage Request(HttpMethod method, string path)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Host = "127.0.0.1:17345";
        request.Headers.Add("Origin", AllowedOrigin);
        return request;
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public ConcurrentQueue<string> Messages { get; } = new();

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(Messages);

        public void Dispose()
        {
        }

        private sealed class CapturingLogger(ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => NullScope.Instance;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                messages.Enqueue(formatter(state, exception));
            }
        }

        private sealed class NullScope : IDisposable
        {
            public static NullScope Instance { get; } = new();
            public void Dispose()
            {
            }
        }
    }
}
