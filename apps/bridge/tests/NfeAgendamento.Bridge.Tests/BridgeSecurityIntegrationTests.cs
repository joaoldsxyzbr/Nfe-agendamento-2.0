using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class BridgeSecurityIntegrationTests : IAsyncDisposable
{
    private const string AllowedOrigin = "https://nfeagendamento.joaolds.xyz.br";
    private readonly WebApplicationFactory<Program> _factory;

    public BridgeSecurityIntegrationTests()
    {
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
            });
    }

    [Fact]
    public async Task Allowed_origin_and_loopback_host_can_read_health()
    {
        using var client = CreateClient();
        using var request = Request(AllowedOrigin);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(AllowedOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("http://nfeagendamento.joaolds.xyz.br")]
    [InlineData(null)]
    public async Task Untrusted_or_missing_origin_is_forbidden(string? origin)
    {
        using var client = CreateClient();
        using var request = Request(origin);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Lan_host_is_forbidden()
    {
        using var client = CreateClient();
        using var request = Request(AllowedOrigin);
        request.Headers.Host = "192.168.0.10:17345";

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
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

    private static HttpRequestMessage Request(string? origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        request.Headers.Host = "127.0.0.1:17345";
        if (origin is not null)
        {
            request.Headers.Add("Origin", origin);
        }

        return request;
    }
}
