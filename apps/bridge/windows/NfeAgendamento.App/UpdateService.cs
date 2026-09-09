using System.Net.Http.Headers;
using System.Security.Cryptography;

namespace NfeAgendamento.App.Updater;

public sealed class UpdateService
{
    private static readonly Uri LatestReleaseUri = new(
        "https://api.github.com/repos/joaoldsxyzbr/Nfe-agendamento-2.0/releases/latest");

    public const long MaxInstallerBytes = 256L * 1024 * 1024;

    private readonly HttpClient _httpClient;
    private readonly string _updateDirectory;

    public UpdateService(HttpClient httpClient, string updateDirectory)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _updateDirectory = string.IsNullOrWhiteSpace(updateDirectory)
            ? throw new ArgumentException("Diretório de atualização inválido.", nameof(updateDirectory))
            : Path.GetFullPath(updateDirectory);
    }

    public async Task<UpdateCheckResult> CheckAsync(Version currentVersion, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(currentVersion);

        using var request = new HttpRequestMessage(HttpMethod.Get, LatestReleaseUri);
        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("NFeAgendamentoBridge", currentVersion.ToString(3)));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        return UpdateReleaseParser.Parse(json, currentVersion);
    }

    public async Task<string> DownloadAsync(UpdateAsset asset, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(asset);

        if (!string.Equals(Path.GetFileName(asset.Name), asset.Name, StringComparison.Ordinal) ||
            !asset.Name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Nome do instalador inválido.");

        if (asset.Size <= 0 || asset.Size > MaxInstallerBytes)
            throw new InvalidDataException("Tamanho publicado do instalador inválido.");

        Directory.CreateDirectory(_updateDirectory);
        var finalPath = Path.Combine(_updateDirectory, asset.Name);
        var temporaryPath = finalPath + ".download";
        TryDelete(temporaryPath);

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, asset.DownloadUrl);
            request.Headers.UserAgent.Add(new ProductInfoHeaderValue("NFeAgendamentoBridge", "updater"));

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();

            if (response.Content.Headers.ContentLength is long contentLength && contentLength != asset.Size)
                throw new InvalidDataException("O tamanho baixado não corresponde ao publicado na release.");

            await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var destination = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 64 * 1024,
                options: FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                var buffer = new byte[64 * 1024];
                long total = 0;
                while (true)
                {
                    var read = await source.ReadAsync(buffer, cancellationToken);
                    if (read == 0) break;

                    total += read;
                    if (total > asset.Size || total > MaxInstallerBytes)
                        throw new InvalidDataException("O instalador excedeu o tamanho publicado na release.");

                    await destination.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }

                await destination.FlushAsync(cancellationToken);
                if (total != asset.Size)
                    throw new InvalidDataException("O tamanho baixado não corresponde ao publicado na release.");
            }

            await VerifyDigestAsync(temporaryPath, asset.Digest, cancellationToken);
            File.Move(temporaryPath, finalPath, overwrite: true);
            return finalPath;
        }
        catch
        {
            TryDelete(temporaryPath);
            TryDelete(finalPath);
            throw;
        }
    }

    private static async Task VerifyDigestAsync(string path, string digest, CancellationToken cancellationToken)
    {
        const string prefix = "sha256:";
        if (!digest.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException("Digest SHA-256 da release inválido.");

        var expectedHex = digest[prefix.Length..];
        if (expectedHex.Length != 64 || expectedHex.Any(character => !Uri.IsHexDigit(character)))
            throw new InvalidDataException("Digest SHA-256 da release inválido.");

        await using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 64 * 1024,
            options: FileOptions.Asynchronous | FileOptions.SequentialScan);
        var actual = await SHA256.HashDataAsync(stream, cancellationToken);
        var expected = Convert.FromHexString(expectedHex);

        if (!CryptographicOperations.FixedTimeEquals(actual, expected))
            throw new InvalidDataException("A verificação SHA-256 do instalador falhou.");
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
        }
    }
}
