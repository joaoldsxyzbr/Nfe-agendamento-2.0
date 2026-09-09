using System.Diagnostics;

namespace NfeAgendamento.Bridge.Portal;

public sealed class ProcessPortalWindowLauncher : IPortalWindowLauncher, IAsyncDisposable
{
    private const string HelperFileName = "NfeAgendamento.Portal.exe";
    private readonly string _helperPath;
    private readonly Func<string, bool> _runtimeProbe;
    private readonly Func<bool> _platformProbe;
    private readonly PersistentPortalClient _persistentClient;
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
        var sessions = new PortalProcessSessionFactory(_helperPath);
        _persistentClient = new PersistentPortalClient(sessions.CreateAsync);
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

    public Task<PortalLaunchResult> OpenAsync(
        PortalLaunchRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!IsAvailable)
            return Task.FromResult(PortalLaunchResult.Failed(
                "O componente WebView2 do Portal não está disponível neste computador."));

        return _persistentClient.OpenAsync(request, cancellationToken);
    }

    public ValueTask DisposeAsync() => _persistentClient.DisposeAsync();

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
}
