using System.Net;
using System.Security.Cryptography;
using NfeAgendamento.App.Updater;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class UpdateServiceTests
{
    [Fact]
    public async Task CheckAsync_uses_the_official_update_proxy()
    {
        const string json = """
        {
          "tag_name": "v0.0.6",
          "draft": false,
          "prerelease": false,
          "assets": []
        }
        """;
        using var http = new HttpClient(new InspectUriHandler(
            new Uri("https://nfeagendamento.joaolds.xyz.br/api/update/latest"),
            json));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var service = new UpdateService(http, directory, _ => { });

        var result = await service.CheckAsync(new Version(0, 0, 6), TestContext.Current.CancellationToken);

        Assert.False(result.IsUpdateAvailable);
        Assert.Equal(new Version(0, 0, 6), result.LatestVersion);
    }

    [Fact]
    public async Task DownloadAsync_accepts_only_matching_size_and_sha256()
    {
        var bytes = "installer-content"u8.ToArray();
        var digest = "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        using var http = new HttpClient(new StubHandler(bytes));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var service = new UpdateService(http, directory, _ => { });
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
            digest,
            bytes.Length);

        try
        {
            var path = await service.DownloadAsync(asset, TestContext.Current.CancellationToken);

            Assert.Equal(Path.Combine(directory, asset.Name), path);
            Assert.Equal(bytes, await File.ReadAllBytesAsync(path, TestContext.Current.CancellationToken));
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task DownloadAsync_verifies_authenticode_before_exposing_the_installer()
    {
        var bytes = "installer-content"u8.ToArray();
        var digest = "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        using var http = new HttpClient(new StubHandler(bytes));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var verifiedPaths = new List<string>();
        var service = new UpdateService(http, directory, path => verifiedPaths.Add(path));
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
            digest,
            bytes.Length);

        try
        {
            var path = await service.DownloadAsync(asset, TestContext.Current.CancellationToken);

            Assert.Single(verifiedPaths);
            Assert.EndsWith(".download", verifiedPaths[0], StringComparison.OrdinalIgnoreCase);
            Assert.Equal(Path.Combine(directory, asset.Name), path);
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task DownloadAsync_rejects_untrusted_authenticode_and_leaves_no_installer()
    {
        var bytes = "installer-content"u8.ToArray();
        var digest = "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        using var http = new HttpClient(new StubHandler(bytes));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var service = new UpdateService(
            http,
            directory,
            _ => throw new InvalidDataException("Assinatura Authenticode não confiável."));
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
            digest,
            bytes.Length);

        try
        {
            await Assert.ThrowsAsync<InvalidDataException>(() =>
                service.DownloadAsync(asset, TestContext.Current.CancellationToken));

            Assert.False(File.Exists(Path.Combine(directory, asset.Name)));
            Assert.False(File.Exists(Path.Combine(directory, asset.Name) + ".download"));
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task DownloadAsync_rejects_digest_mismatch_and_leaves_no_installer()
    {
        var bytes = "tampered-content"u8.ToArray();
        using var http = new HttpClient(new StubHandler(bytes));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var service = new UpdateService(http, directory, _ => { });
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            bytes.Length);

        try
        {
            await Assert.ThrowsAsync<InvalidDataException>(() =>
                service.DownloadAsync(asset, TestContext.Current.CancellationToken));

            Assert.False(File.Exists(Path.Combine(directory, asset.Name)));
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task DownloadAsync_rejects_size_mismatch()
    {
        var bytes = "installer-content"u8.ToArray();
        var digest = "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        using var http = new HttpClient(new StubHandler(bytes));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var service = new UpdateService(http, directory, _ => { });
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://nfeagendamento.joaolds.xyz.br/downloads/windows/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
            digest,
            bytes.Length + 1);

        try
        {
            await Assert.ThrowsAsync<InvalidDataException>(() =>
                service.DownloadAsync(asset, TestContext.Current.CancellationToken));
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private sealed class InspectUriHandler(Uri expectedUri, string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal(expectedUri, request.RequestUri);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json),
            });
        }
    }

    private sealed class StubHandler(byte[] content) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal(HttpMethod.Get, request.Method);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new ByteArrayContent(content),
            });
        }
    }
}
