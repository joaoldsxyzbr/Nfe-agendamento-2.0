using System.Net;
using System.Security.Cryptography;
using NfeAgendamento.App.Updater;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class UpdateServiceTests
{
    [Fact]
    public async Task DownloadAsync_accepts_only_matching_size_and_sha256()
    {
        var bytes = "installer-content"u8.ToArray();
        var digest = "sha256:" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        using var http = new HttpClient(new StubHandler(bytes));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var service = new UpdateService(http, directory);
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
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
    public async Task DownloadAsync_rejects_digest_mismatch_and_leaves_no_installer()
    {
        var bytes = "tampered-content"u8.ToArray();
        using var http = new HttpClient(new StubHandler(bytes));
        var directory = Path.Combine(Path.GetTempPath(), "nfe-updater-tests", Guid.NewGuid().ToString("N"));
        var service = new UpdateService(http, directory);
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
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
        var service = new UpdateService(http, directory);
        var asset = new UpdateAsset(
            "NFeAgendamentoBridge-Setup-v0.0.6.exe",
            new Uri("https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"),
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
