using System.Diagnostics;
using System.Text;

namespace NfeAgendamento.Bridge.Portal;

public sealed class ProcessPortalWindowLauncher : IPortalWindowLauncher
{
    private const string HelperFileName = "NfeAgendamento.Portal.exe";
    private readonly string _helperPath;
    private readonly Func<string, bool> _runtimeProbe;
    private readonly Func<bool> _platformProbe;
    private readonly object _probeGate = new();
    private bool _runtimeAvailable;

    public ProcessPortalWindowLauncher()
        : this(Path.Combine(AppContext.BaseDirectory, HelperFileName), runtimeProbe: null)
    {
    }

    internal ProcessPortalWindowLauncher(
        string helperPath,
        Func<string, bool>? runtimeProbe = null)
        : this(helperPath, runtimeProbe, OperatingSystem.IsWindows)
    {
    }

    internal ProcessPortalWindowLauncher(
        string helperPath,
        Func<string, bool>? runtimeProbe,
        Func<bool>? platformProbe)
    {
        _helperPath = helperPath;
        _runtimeProbe = runtimeProbe ?? ProbeRuntime;
        _platformProbe = platformProbe ?? OperatingSystem.IsWindows;
    }

    public bool IsAvailable
    {
        get
        {
            if (!_platformProbe() || !File.Exists(_helperPath)) return false;
            if (_runtimeAvailable) return true;

            lock (_probeGate)
            {
                if (_runtimeAvailable) return true;
                if (!_runtimeProbe(_helperPath)) return false;
                _runtimeAvailable = true;
                return true;
            }
        }
    }

    public async Task<PortalLaunchResult> OpenAsync(
        PortalLaunchRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!IsAvailable)
            return PortalLaunchResult.Failed("O componente WebView2 do Portal não está disponível neste computador.");

        var directory = Path.Combine(Path.GetTempPath(), "NfeAgendamento", "portal-result");
        Directory.CreateDirectory(directory);
        var token = Guid.NewGuid().ToString("N");
        var resultPath = Path.Combine(directory, $"{token}.xml");
        var errorPath = Path.Combine(directory, $"{token}.error.txt");

        try
        {
            using var process = new Process
            {
                StartInfo = CreateStartInfo(request, resultPath, errorPath),
                EnableRaisingEvents = true,
            };

            if (!process.Start())
                return PortalLaunchResult.Failed("Não foi possível iniciar a janela do Portal da NF-e.");

            await process.WaitForExitAsync(cancellationToken);

            if (process.ExitCode == 0)
            {
                if (!File.Exists(resultPath))
                    return PortalLaunchResult.Failed("O Portal foi concluído sem retornar um XML utilizável.");

                var info = new FileInfo(resultPath);
                if (info.Length <= 0 || info.Length > NfePortalXmlValidator.MaxXmlBytes)
                    return PortalLaunchResult.Failed("O XML retornado pelo Portal possui tamanho inválido.");

                var xml = await File.ReadAllTextAsync(resultPath, Encoding.UTF8, cancellationToken);
                return PortalLaunchResult.Completed(xml);
            }

            var message = await ReadErrorAsync(errorPath, cancellationToken);
            return process.ExitCode == 2
                ? PortalLaunchResult.Cancelled(message ?? "Portal fechado pelo usuário.")
                : PortalLaunchResult.Failed(message ?? "Não foi possível concluir a consulta pelo Portal da NF-e.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            return PortalLaunchResult.Failed(exception.Message);
        }
        finally
        {
            TryDelete(resultPath);
            TryDelete(errorPath);
        }
    }

    private ProcessStartInfo CreateStartInfo(
        PortalLaunchRequest request,
        string resultPath,
        string errorPath)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = _helperPath,
            UseShellExecute = false,
            CreateNoWindow = false,
            WorkingDirectory = AppContext.BaseDirectory,
        };

        startInfo.ArgumentList.Add("--access-key");
        startInfo.ArgumentList.Add(request.AccessKey);
        startInfo.ArgumentList.Add("--thumbprint");
        startInfo.ArgumentList.Add(request.CertificateThumbprint);
        startInfo.ArgumentList.Add("--result");
        startInfo.ArgumentList.Add(resultPath);
        startInfo.ArgumentList.Add("--error");
        startInfo.ArgumentList.Add(errorPath);
        return startInfo;
    }

    private static bool ProbeRuntime(string helperPath)
    {
        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = helperPath,
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(helperPath) ?? AppContext.BaseDirectory,
            };
            startInfo.ArgumentList.Add("--probe-runtime");

            using var process = Process.Start(startInfo);
            if (process is null) return false;

            if (!process.WaitForExit(milliseconds: 1_500))
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch (Exception exception) when (
                    exception is InvalidOperationException or System.ComponentModel.Win32Exception)
                {
                }

                return false;
            }

            return process.ExitCode == 0;
        }
        catch (Exception exception) when (
            exception is IOException
            or UnauthorizedAccessException
            or InvalidOperationException
            or System.ComponentModel.Win32Exception)
        {
            return false;
        }
    }

    private static async Task<string?> ReadErrorAsync(string path, CancellationToken cancellationToken)
    {
        if (!File.Exists(path)) return null;
        var info = new FileInfo(path);
        if (info.Length <= 0 || info.Length > 64 * 1024) return null;
        var message = (await File.ReadAllTextAsync(path, Encoding.UTF8, cancellationToken)).Trim();
        return string.IsNullOrWhiteSpace(message) ? null : message;
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
