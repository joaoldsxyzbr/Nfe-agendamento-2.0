using NfeAgendamento.App.Updater;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class UpdateReleaseParserTests
{
    private const string Digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    [Fact]
    public void Parses_newer_stable_release_and_exact_installer_asset()
    {
        var json = $$"""
        {
          "tag_name": "v0.0.6",
          "draft": false,
          "prerelease": false,
          "assets": [
            {
              "name": "NFeAgendamentoBridge-Setup-v0.0.6.exe",
              "state": "uploaded",
              "size": 12345,
              "digest": "{{Digest}}",
              "browser_download_url": "https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"
            }
          ]
        }
        """;

        var result = UpdateReleaseParser.Parse(json, new Version(0, 0, 5));

        Assert.True(result.IsUpdateAvailable);
        Assert.Equal(new Version(0, 0, 6), result.LatestVersion);
        Assert.NotNull(result.Asset);
        Assert.Equal("NFeAgendamentoBridge-Setup-v0.0.6.exe", result.Asset.Name);
        Assert.Equal(Digest, result.Asset.Digest);
    }

    [Fact]
    public void Rejects_release_without_sha256_digest()
    {
        var json = """
        {
          "tag_name": "v0.0.6",
          "draft": false,
          "prerelease": false,
          "assets": [
            {
              "name": "NFeAgendamentoBridge-Setup-v0.0.6.exe",
              "state": "uploaded",
              "size": 12345,
              "digest": null,
              "browser_download_url": "https://github.com/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/v0.0.6/NFeAgendamentoBridge-Setup-v0.0.6.exe"
            }
          ]
        }
        """;

        Assert.Throws<InvalidDataException>(() =>
            UpdateReleaseParser.Parse(json, new Version(0, 0, 5)));
    }

    [Fact]
    public void Rejects_installer_url_outside_expected_repository_release_path()
    {
        var json = $$"""
        {
          "tag_name": "v0.0.6",
          "draft": false,
          "prerelease": false,
          "assets": [
            {
              "name": "NFeAgendamentoBridge-Setup-v0.0.6.exe",
              "state": "uploaded",
              "size": 12345,
              "digest": "{{Digest}}",
              "browser_download_url": "https://example.com/NFeAgendamentoBridge-Setup-v0.0.6.exe"
            }
          ]
        }
        """;

        Assert.Throws<InvalidDataException>(() =>
            UpdateReleaseParser.Parse(json, new Version(0, 0, 5)));
    }

    [Fact]
    public void Rejects_malformed_release_json_as_invalid_data()
    {
        Assert.Throws<InvalidDataException>(() =>
            UpdateReleaseParser.Parse("{\"tag_name\":", new Version(0, 0, 5)));
    }
}
