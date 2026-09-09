using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

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
    private Process? _bridgeProcess;

    public TrayApplicationContext()
    {
        StopExistingBridgeProcesses();
        _bridgeProcess = StartBridgeHidden();

        _menu = new ContextMenuStrip();
        _menu.Items.Add(new ToolStripMenuItem("Abrir NFe Agendamento", null, (_, _) => OpenSite()));
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
