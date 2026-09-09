using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using NfeAgendamento.App.Updater;

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
    private const string SiteUrl = "https://nfeagendamento.joaolds.xyz.br";
    private const string BridgeProcessName = "NfeAgendamento.Bridge";
    private readonly ContextMenuStrip _menu;
    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _updateMenuItem;
    private readonly HttpClient _httpClient;
    private readonly UpdateService _updateService;
    private Process? _bridgeProcess;
    private int _updateInProgress;
    private bool _exitingForUpdate;

    public TrayApplicationContext()
    {
        StopExistingBridgeProcesses();
        _bridgeProcess = StartBridgeHidden();

        _httpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(2),
        };
        _updateService = new UpdateService(
            _httpClient,
            Path.Combine(Path.GetTempPath(), "NfeAgendamento", "updates"));

        _menu = new ContextMenuStrip();
        _menu.Items.Add(new ToolStripMenuItem("Abrir NFe Agendamento", null, (_, _) => OpenSite()));
        _updateMenuItem = new ToolStripMenuItem(
            "Verificar atualizações",
            null,
            async (_, _) => await CheckForUpdatesAsync());
        _menu.Items.Add(_updateMenuItem);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add(new ToolStripMenuItem("Sair", null, (_, _) => ExitThread()));

        _notifyIcon = new NotifyIcon
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application,
            Text = "NFe Agendamento — ativo",
            ContextMenuStrip = _menu,
            Visible = true,
        };
        _notifyIcon.DoubleClick += (_, _) => OpenSite();
    }

    private async Task CheckForUpdatesAsync()
    {
        if (Interlocked.CompareExchange(ref _updateInProgress, 1, 0) != 0)
            return;

        _updateMenuItem.Enabled = false;
        var originalText = _notifyIcon.Text;

        try
        {
            _notifyIcon.Text = "NFe Agendamento — verificando atualização";
            var currentVersion = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0);
            var result = await _updateService.CheckAsync(currentVersion, CancellationToken.None);

            if (!result.IsUpdateAvailable || result.Asset is null)
            {
                MessageBox.Show(
                    $"Você já está na versão mais recente ({currentVersion.ToString(3)}).",
                    "NFe Agendamento",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return;
            }

            var confirmation = MessageBox.Show(
                $"Uma nova versão está disponível.\n\nInstalada: {currentVersion.ToString(3)}\nNova: {result.LatestVersion.ToString(3)}\n\nDeseja baixar e instalar agora? O NFe Agendamento será fechado durante a atualização.",
                "Atualização disponível",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question,
                MessageBoxDefaultButton.Button2);

            if (confirmation != DialogResult.Yes)
                return;

            _notifyIcon.Text = "NFe Agendamento — baixando atualização";
            var installerPath = await _updateService.DownloadAsync(result.Asset, CancellationToken.None);

            var installer = Process.Start(new ProcessStartInfo
            {
                FileName = installerPath,
                WorkingDirectory = Path.GetDirectoryName(installerPath) ?? Path.GetTempPath(),
                UseShellExecute = true,
            });

            if (installer is null)
                throw new InvalidOperationException("O instalador foi validado, mas não pôde ser iniciado.");

            installer.Dispose();
            _exitingForUpdate = true;
            ExitThread();
        }
        catch (Exception exception) when (
            exception is HttpRequestException
            or TaskCanceledException
            or IOException
            or InvalidDataException
            or UnauthorizedAccessException
            or InvalidOperationException
            or Win32Exception)
        {
            MessageBox.Show(
                $"Não foi possível atualizar o NFe Agendamento.\n\n{exception.Message}",
                "Falha na atualização",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
        finally
        {
            if (!_exitingForUpdate)
            {
                _notifyIcon.Text = originalText;
                _updateMenuItem.Enabled = true;
                Volatile.Write(ref _updateInProgress, 0);
            }
        }
    }

    private static void StopExistingBridgeProcesses()
    {
        foreach (var process in Process.GetProcessesByName(BridgeProcessName))
        {
            using (process)
            {
                try
                {
                    if (process.HasExited)
                        continue;

                    process.Kill(entireProcessTree: true);
                    process.WaitForExit(2000);
                }
                catch
                {
                    // Um Bridge de outra sessão pode não ser encerrável pelo usuário atual.
                }
            }
        }
    }

    private static Process? StartBridgeHidden()
    {
        var bridgePath = Path.Combine(AppContext.BaseDirectory, "NfeAgendamento.Bridge.exe");
        if (!File.Exists(bridgePath))
        {
            MessageBox.Show(
                "O componente local do NFe Agendamento não foi encontrado. Reinstale o aplicativo.",
                "NFe Agendamento",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return null;
        }

        return Process.Start(new ProcessStartInfo
        {
            FileName = bridgePath,
            WorkingDirectory = AppContext.BaseDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        });
    }

    private static void OpenSite()
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = SiteUrl,
            UseShellExecute = true,
        });
    }

    protected override void ExitThreadCore()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _menu.Dispose();
        _httpClient.Dispose();

        try
        {
            if (_bridgeProcess is { HasExited: false })
            {
                _bridgeProcess.Kill(entireProcessTree: true);
                _bridgeProcess.WaitForExit(2000);
            }
        }
        catch
        {
            // O Windows pode encerrar o processo durante logoff/desligamento.
        }
        finally
        {
            _bridgeProcess?.Dispose();
        }

        base.ExitThreadCore();
    }
}
