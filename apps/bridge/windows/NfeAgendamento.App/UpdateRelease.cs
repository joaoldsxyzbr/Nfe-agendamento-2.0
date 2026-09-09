using System.Text.Json;

namespace NfeAgendamento.App.Updater;

public sealed record UpdateAsset(
    string Name,
    Uri DownloadUrl,
    string Digest,
    long Size);

public sealed record UpdateCheckResult(
    Version LatestVersion,
    bool IsUpdateAvailable,
    UpdateAsset? Asset);

public static class UpdateReleaseParser
{
    private const string RepositoryPath = "/joaoldsxyzbr/Nfe-agendamento-2.0/releases/download/";

    public static UpdateCheckResult Parse(string json, Version currentVersion)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        ArgumentNullException.ThrowIfNull(currentVersion);

        using var document = ParseDocument(json);
        var root = document.RootElement;

        if (root.TryGetProperty("draft", out var draft) && draft.GetBoolean())
            throw new InvalidDataException("A release mais recente ainda está em rascunho.");
        if (root.TryGetProperty("prerelease", out var prerelease) && prerelease.GetBoolean())
            throw new InvalidDataException("A release mais recente é uma pré-release.");

        var tag = RequiredString(root, "tag_name");
        if (!tag.StartsWith('v') || !Version.TryParse(tag[1..], out var latestVersion))
            throw new InvalidDataException("A release retornou uma versão inválida.");

        if (latestVersion <= currentVersion)
            return new UpdateCheckResult(latestVersion, false, null);

        var expectedName = $"NFeAgendamentoBridge-Setup-{tag}.exe";
        if (!root.TryGetProperty("assets", out var assets) || assets.ValueKind != JsonValueKind.Array)
            throw new InvalidDataException("A release não contém o instalador esperado.");

        JsonElement? selected = null;
        foreach (var asset in assets.EnumerateArray())
        {
            if (string.Equals(OptionalString(asset, "name"), expectedName, StringComparison.Ordinal))
            {
                selected = asset;
                break;
            }
        }

        if (selected is null)
            throw new InvalidDataException("A release não contém o instalador esperado.");

        var selectedAsset = selected.Value;
        if (!string.Equals(OptionalString(selectedAsset, "state"), "uploaded", StringComparison.Ordinal))
            throw new InvalidDataException("O instalador da release ainda não está disponível.");

        var size = selectedAsset.TryGetProperty("size", out var sizeElement) && sizeElement.TryGetInt64(out var parsedSize)
            ? parsedSize
            : 0;
        if (size <= 0)
            throw new InvalidDataException("O instalador da release possui tamanho inválido.");

        var digest = RequiredString(selectedAsset, "digest");
        ValidateSha256Digest(digest);

        var downloadUrlText = RequiredString(selectedAsset, "browser_download_url");
        if (!Uri.TryCreate(downloadUrlText, UriKind.Absolute, out var downloadUrl) ||
            !string.Equals(downloadUrl.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(downloadUrl.Host, "github.com", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("A URL do instalador não pertence ao GitHub esperado.");

        var expectedPath = RepositoryPath + Uri.EscapeDataString(tag) + "/" + Uri.EscapeDataString(expectedName);
        if (!string.Equals(downloadUrl.AbsolutePath, expectedPath, StringComparison.Ordinal))
            throw new InvalidDataException("A URL do instalador não corresponde à release esperada.");

        return new UpdateCheckResult(
            latestVersion,
            true,
            new UpdateAsset(expectedName, downloadUrl, digest, size));
    }

    private static JsonDocument ParseDocument(string json)
    {
        try
        {
            return JsonDocument.Parse(json);
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("A resposta da release do GitHub não contém JSON válido.", exception);
        }
    }

    private static string RequiredString(JsonElement element, string propertyName)
    {
        var value = OptionalString(element, propertyName);
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidDataException($"A release não informou {propertyName}.");
        return value;
    }

    private static string? OptionalString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static void ValidateSha256Digest(string digest)
    {
        const string prefix = "sha256:";
        if (!digest.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("A release não informou digest SHA-256 válido.");

        var hex = digest[prefix.Length..];
        if (hex.Length != 64 || hex.Any(character => !Uri.IsHexDigit(character)))
            throw new InvalidDataException("A release não informou digest SHA-256 válido.");
    }
}
