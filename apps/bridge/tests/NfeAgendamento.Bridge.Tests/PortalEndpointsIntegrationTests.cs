using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalEndpointsIntegrationTests : IAsyncDisposable
{
    private const string AllowedOrigin = "https://nfeagendamento.example";
    private const string AccessKey = "42260812345678000123550010000012341000012342";
    private readonly PortalFallbackService _portal;
    private readonly WebApplicationFactory<Program> _factory;

    public PortalEndpointsIntegrationTests()
    {
        var launcher = new FakeLauncher();
        _portal = new PortalFallbackService(launcher, () => "ABC123");
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
                builder.ConfigureServices(services =>
                {
                    services.RemoveAll<PortalFallbackService>();
                    services.AddSingleton(_portal);
                });
            });
    }

    [Fact]
    public async Task Start_and_status_endpoints_expose_ephemeral_operation()
    {
        using var client = CreateClient();
        using var start = Request(HttpMethod.Post, "/api/v1/portal/start");
        start.Content = JsonContent.Create(new { accessKey = AccessKey });
        using var startResponse = await client.SendAsync(start, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Accepted, startResponse.StatusCode);
        var started = await startResponse.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        var operationId = started.GetProperty("operationId").GetString();
        Assert.False(string.IsNullOrWhiteSpace(operationId));

        PortalOperationStatus? status = null;
        for (var attempt = 0; attempt < 30; attempt++)
        {
            using var request = Request(HttpMethod.Get, $"/api/v1/portal/status/{operationId}");
            using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            status = await response.Content.ReadFromJsonAsync<PortalOperationStatus>(TestContext.Current.CancellationToken);
            if (status?.State == PortalOperationStates.Completed) break;
            await Task.Delay(10, TestContext.Current.CancellationToken);
        }

        Assert.NotNull(status);
        Assert.Equal(PortalOperationStates.Completed, status!.State);
        Assert.Contains(AccessKey, status.Xml);
    }

    [Fact]
    public async Task Unknown_operation_returns_not_found()
    {
        using var client = CreateClient();
        using var request = Request(HttpMethod.Get, "/api/v1/portal/status/unknown");
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
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
        request.Headers.TryAddWithoutValidation("Origin", AllowedOrigin);
        return request;
    }

    private sealed class FakeLauncher : IPortalWindowLauncher
    {
        public bool IsAvailable => true;

        public Task<PortalLaunchResult> OpenAsync(PortalLaunchRequest request, CancellationToken cancellationToken)
        {
            var xml = $"<nfeProc xmlns=\"http://www.portalfiscal.inf.br/nfe\"><NFe><infNFe Id=\"NFe{request.AccessKey}\" /></NFe></nfeProc>";
            return Task.FromResult(PortalLaunchResult.Completed(xml));
        }
    }
}
