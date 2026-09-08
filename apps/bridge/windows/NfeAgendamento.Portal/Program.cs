namespace NfeAgendamento.Portal;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var errorPath = PortalArguments.FindValue(args, "--error");
        if (!PortalArguments.TryParse(args, out var options, out var error))
        {
            PortalArguments.TryWriteError(errorPath, error);
            return 1;
        }

        ApplicationConfiguration.Initialize();
        using var window = new PortalWindow(options);
        Application.Run(window);
        return window.ExitCode;
    }
}

internal sealed record PortalOptions(
    string AccessKey,
    string CertificateThumbprint,
    string ResultPath,
    string ErrorPath);

internal static class PortalArguments
{
    public static bool TryParse(string[] args, out PortalOptions options, out string error)
    {
        options = null!;
        error = string.Empty;

        if (args.Length != 8)
        {
            error = "Argumentos inválidos para o helper do Portal.";
            return false;
        }

        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 0; index < args.Length; index += 2)
        {
            var name = args[index];
            var value = args[index + 1];
            if (name is not ("--access-key" or "--thumbprint" or "--result" or "--error") ||
                string.IsNullOrWhiteSpace(value) ||
                !values.TryAdd(name, value))
            {
                error = "Argumentos inválidos para o helper do Portal.";
                return false;
            }
        }

        if (!values.TryGetValue("--access-key", out var accessKey) ||
            accessKey.Length != 44 ||
            accessKey.Any(character => !char.IsAsciiDigit(character)))
        {
            error = "Chave NF-e inválida para o Portal.";
            return false;
        }

        if (!values.TryGetValue("--thumbprint", out var thumbprint))
        {
            error = "Thumbprint do certificado não informado.";
            return false;
        }

        var normalizedThumbprint = NormalizeThumbprint(thumbprint);
        if (normalizedThumbprint.Length == 0)
        {
            error = "Thumbprint do certificado não informado.";
            return false;
        }

        if (!values.TryGetValue("--result", out var resultPath) ||
            !values.TryGetValue("--error", out var errorPath))
        {
            error = "Caminhos de resultado inválidos para o Portal.";
            return false;
        }

        try
        {
            resultPath = Path.GetFullPath(resultPath);
            errorPath = Path.GetFullPath(errorPath);
        }
        catch (Exception exception) when (exception is ArgumentException or NotSupportedException or PathTooLongException)
        {
            error = "Caminhos de resultado inválidos para o Portal.";
            return false;
        }

        if (string.Equals(resultPath, errorPath, StringComparison.OrdinalIgnoreCase))
        {
            error = "Os arquivos de resultado e erro do Portal devem ser diferentes.";
            return false;
        }

        options = new PortalOptions(accessKey, normalizedThumbprint, resultPath, errorPath);
        return true;
    }

    public static string? FindValue(string[] args, string name)
    {
        for (var index = 0; index + 1 < args.Length; index += 2)
        {
            if (string.Equals(args[index], name, StringComparison.Ordinal))
                return args[index + 1];
        }

        return null;
    }

    public static void TryWriteError(string? path, string message)
    {
        if (string.IsNullOrWhiteSpace(path)) return;

        try
        {
            var fullPath = Path.GetFullPath(path);
            Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
            File.WriteAllText(fullPath, message);
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
        }
    }

    public static string NormalizeThumbprint(string? thumbprint) =>
        string.Concat((thumbprint ?? string.Empty).Where(character => !char.IsWhiteSpace(character))).ToUpperInvariant();
}
