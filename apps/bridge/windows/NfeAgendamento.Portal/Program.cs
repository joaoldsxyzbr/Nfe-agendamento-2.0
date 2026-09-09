using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;

namespace NfeAgendamento.Portal;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 1 && string.Equals(args[0], "--probe-runtime", StringComparison.Ordinal))
            return ProbeRuntime();

        if (args.Length > 0 && string.Equals(args[0], "--server", StringComparison.Ordinal))
        {
            if (!PortalArguments.TryParseServer(args, out var serverOptions, out _))
                return 1;

            ApplicationConfiguration.Initialize();
            using var context = new PortalServerApplicationContext(serverOptions);
            Application.Run(context);
            return context.ExitCode;
        }

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

    private static int ProbeRuntime()
    {
        try
        {
            var version = CoreWebView2Environment.GetAvailableBrowserVersionString();
            return string.IsNullOrWhiteSpace(version) ? 1 : 0;
        }
        catch (WebView2RuntimeNotFoundException)
        {
            return 1;
        }
        catch (Exception exception) when (exception is InvalidOperationException or COMException)
        {
            return 1;
        }
    }
}

internal sealed class PortalServerApplicationContext : ApplicationContext
{
    private readonly PortalWindow _window;
    private readonly PortalServerOptions _options;
    private readonly CancellationTokenSource _lifetime = new();
    private bool _started;

    public PortalServerApplicationContext(PortalServerOptions options)
    {
        _options = options;
        _window = PortalWindow.CreateServerWindow();
        Application.Idle += StartServerOnce;
    }

    public int ExitCode { get; private set; } = 1;

    private async void StartServerOnce(object? sender, EventArgs e)
    {
        if (_started) return;
        _started = true;
        Application.Idle -= StartServerOnce;

        try
        {
            await _window.PrepareAsync();
            var server = new PortalServer(_options.PipeName, _options.ParentProcessId, _window);
            await server.RunAsync(_lifetime.Token);
            ExitCode = 0;
        }
        catch (OperationCanceledException)
        {
            ExitCode = 0;
        }
        catch (Exception exception) when (
            exception is WebView2RuntimeNotFoundException
            or IOException
            or UnauthorizedAccessException
            or InvalidOperationException
            or COMException)
        {
            ExitCode = 1;
        }
        finally
        {
            _window.Shutdown();
            ExitThread();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Application.Idle -= StartServerOnce;
            _lifetime.Cancel();
            _lifetime.Dispose();
            _window.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal sealed record PortalServerOptions(string PipeName, int ParentProcessId);

internal sealed record PortalOptions(
    string AccessKey,
    string CertificateThumbprint,
    string ResultPath,
    string ErrorPath);

internal static class PortalArguments
{
    public static bool TryParseServer(string[] args, out PortalServerOptions options, out string error)
    {
        options = null!;
        error = string.Empty;

        if (args.Length != 5 || !string.Equals(args[0], "--server", StringComparison.Ordinal))
        {
            error = "Argumentos inválidos para o servidor do Portal.";
            return false;
        }

        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 1; index < args.Length; index += 2)
        {
            var name = args[index];
            var value = args[index + 1];
            if (name is not ("--pipe-name" or "--parent-pid") ||
                string.IsNullOrWhiteSpace(value) ||
                !values.TryAdd(name, value))
            {
                error = "Argumentos inválidos para o servidor do Portal.";
                return false;
            }
        }

        if (!values.TryGetValue("--pipe-name", out var pipeName) ||
            pipeName.Length > 200 ||
            pipeName.Any(character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_'))
        {
            error = "Nome do pipe do Portal inválido.";
            return false;
        }

        if (!values.TryGetValue("--parent-pid", out var parentText) ||
            !int.TryParse(parentText, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var parentProcessId) ||
            parentProcessId <= 0)
        {
            error = "PID do Bridge inválido para o Portal.";
            return false;
        }

        options = new PortalServerOptions(pipeName, parentProcessId);
        return true;
    }

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
