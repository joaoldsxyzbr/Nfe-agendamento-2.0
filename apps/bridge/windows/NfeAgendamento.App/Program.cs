using System.ComponentModel;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using NfeAgendamento.App.Runtime;
using NfeAgendamento.Bridge.Runtime;

namespace NfeAgendamento.App;

internal static class Program
{
    private const string SingleInstanceName = "Local\\NfeAgendamento.App";

    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, SingleInstanceName, out var isFirstInstance);
        if (!isFirstInstance)
            return;

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }
}

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly NotifyIcon _notifyIcon;
    private readonly System.Windows.Forms.Timer _bridgeMonitor;
    private readonly BridgeRestartPolicy _restartPolicy = new(TimeSpan.FromSeconds(30));
    private readonly CancellationTokenSource _lifetimeCancellation = new();
    private readonly string _bridgePath;
    private readonly string _expectedBridgeVersion;
    private BridgeControlClient? _bridgeControlClient;
    private BridgeControlIdentity? _bridgeIdentity;
    private DateTimeOffset? _nextBridgeAttemptAt;
    private int _bridgeRefreshInProgress;

    public TrayApplicationContext()
    {
        _bridgePath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "NfeAgendamento.Bridge.exe"));
        _expectedBridgeVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0";

        _notifyIcon = new NotifyIcon
        {
            Text = "NFe Agendamento — supervisor",
            Visible = false,
        };

        _bridgeMonitor = new System.Windows.Forms.Timer
        {
            Interval = (int)BridgeControlConstants.HeartbeatInterval.TotalMilliseconds,
        };
        _bridgeMonitor.Tick += async (_, _) => await RefreshBridgeStatusAsync();
        _bridgeMonitor.Start();
        _ = RefreshBridgeStatusAsync();
    }

    private async Task RefreshBridgeStatusAsync()
    {
        if (Interlocked.CompareExchange(ref _bridgeRefreshInProgress, 1, 0) != 0)
            return;

        try
        {
            var now = DateTimeOffset.UtcNow;

            if (_bridgeControlClient is not null)
            {
                try
                {
                    await _bridgeControlClient.HeartbeatAsync(_lifetimeCancellation.Token);
                    _restartPolicy.RegisterHealthy();
                    _nextBridgeAttemptAt = null;
                    _notifyIcon.Text = "NFe Agendamento — ativo";
                    return;
                }
                catch (Exception exception) when (IsBridgeControlFailure(exception))
                {
                    ClearBridgeControl();
                    ScheduleRestart(now);
                }
            }

            if (_restartPolicy.IsCircuitOpen(now))
            {
                _notifyIcon.Text = "NFe Agendamento — Bridge indisponível";
                return;
            }

            if (_nextBridgeAttemptAt is not null && now < _nextBridgeAttemptAt.Value)
            {
                _notifyIcon.Text = "NFe Agendamento — reconectando Bridge";
                return;
            }

            if (await TryClaimBridgeAsync(_lifetimeCancellation.Token))
            {
                MarkBridgeHealthy();
                return;
            }

            using var startedBridge = StartBridgeHidden();
            if (startedBridge is null)
            {
                ScheduleRestart(now);
                _notifyIcon.Text = "NFe Agendamento — Bridge indisponível";
                return;
            }

            for (var attempt = 0; attempt < 10; attempt++)
            {
                await Task.Delay(100, _lifetimeCancellation.Token);
                if (!await TryClaimBridgeAsync(_lifetimeCancellation.Token))
                    continue;

                MarkBridgeHealthy();
                return;
            }

            ScheduleRestart(DateTimeOffset.UtcNow);
            _notifyIcon.Text = "NFe Agendamento — Bridge indisponível";
        }
        catch (OperationCanceledException) when (_lifetimeCancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception) when (IsBridgeControlFailure(exception))
        {
            ClearBridgeControl();
            ScheduleRestart(DateTimeOffset.UtcNow);
            _notifyIcon.Text = "NFe Agendamento — Bridge indisponível";
        }
        finally
        {
            Volatile.Write(ref _bridgeRefreshInProgress, 0);
        }
    }

    private async Task<bool> TryClaimBridgeAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_bridgePath))
            return false;

        var client = new BridgeControlClient(
            new NamedPipeBridgeControlTransport(connectTimeout: TimeSpan.FromMilliseconds(250)),
            _bridgePath,
            _expectedBridgeVersion);

        try
        {
            var identity = await client.ClaimAsync(cancellationToken);
            _bridgeControlClient = client;
            _bridgeIdentity = identity;
            return true;
        }
        catch (Exception exception) when (IsBridgeControlFailure(exception))
        {
            return false;
        }
    }

    private void MarkBridgeHealthy()
    {
        _restartPolicy.RegisterHealthy();
        _nextBridgeAttemptAt = null;
        _notifyIcon.Text = "NFe Agendamento — ativo";
    }

    private void ScheduleRestart(DateTimeOffset now)
    {
        var delay = _restartPolicy.RegisterFailure(now);
        _nextBridgeAttemptAt = delay is null ? null : now.Add(delay.Value);
    }

    private void ClearBridgeControl()
    {
        _bridgeControlClient = null;
        _bridgeIdentity = null;
    }

    private Process? StartBridgeHidden()
    {
        if (!File.Exists(_bridgePath))
            return null;

        return Process.Start(new ProcessStartInfo
        {
            FileName = _bridgePath,
            Arguments = "--managed",
            WorkingDirectory = AppContext.BaseDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        });
    }

    private async Task StopBridgeAsync()
    {
        var client = _bridgeControlClient;
        var bridgeIdentity = _bridgeIdentity;
        if (client is null || bridgeIdentity is null)
            return;

        using var shutdownTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try
        {
            await client.ShutdownAsync(shutdownTimeout.Token);
        }
        catch (Exception exception) when (IsBridgeControlFailure(exception))
        {
        }

        try
        {
            using var process = Process.GetProcessById(bridgeIdentity.ProcessId);
            if (process.WaitForExit(2000))
                return;
        }
        catch (ArgumentException)
        {
            return;
        }
        catch (InvalidOperationException)
        {
            return;
        }

        TryForceStopValidatedBridge(bridgeIdentity);
    }

    private static void TryForceStopValidatedBridge(BridgeControlIdentity bridgeIdentity)
    {
        try
        {
            using var process = Process.GetProcessById(bridgeIdentity.ProcessId);
            if (process.HasExited)
                return;

            var actualPath = process.MainModule?.FileName;
            if (string.IsNullOrWhiteSpace(actualPath) ||
                !string.Equals(
                    Path.GetFullPath(actualPath),
                    Path.GetFullPath(bridgeIdentity.ExecutablePath),
                    StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            process.Kill(entireProcessTree: true);
            process.WaitForExit(2000);
        }
        catch (Exception exception) when (
            exception is ArgumentException
            or InvalidOperationException
            or Win32Exception
            or NotSupportedException)
        {
        }
    }

    private static bool IsBridgeControlFailure(Exception exception) =>
        exception is IOException
            or InvalidDataException
            or InvalidOperationException
            or UnauthorizedAccessException
            or OperationCanceledException
            or TimeoutException;

    protected override void ExitThreadCore()
    {
        _bridgeMonitor.Stop();

        try
        {
            Task.Run(StopBridgeAsync).GetAwaiter().GetResult();
        }
        catch
        {
            // Em logoff/desligamento o Windows pode interromper o shutdown gracioso.
        }

        _lifetimeCancellation.Cancel();
        _bridgeMonitor.Dispose();
        _lifetimeCancellation.Dispose();
        _notifyIcon.Dispose();

        base.ExitThreadCore();
    }
}
