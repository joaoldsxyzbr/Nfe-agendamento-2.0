using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace NfeAgendamento.Portal;

internal sealed class PortalWindow : Form
{
    private const string OfficialHost = "www.nfe.fazenda.gov.br";
    private const string PortalUrl = "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g%3D";
    private const long MaxXmlBytes = 10L * 1024 * 1024;
    private const int RpcEDisconnected = unchecked((int)0x80010108);
    private const int RoEClosed = unchecked((int)0x80000013);
    private const int EAbort = unchecked((int)0x80004004);

    private readonly PortalOptions _options;
    private readonly WebView2 _webView;
    private readonly Label _status;
    private string? _temporaryDownloadPath;
    private bool _downloadInProgress;
    private bool _finalized;

    public PortalWindow(PortalOptions options)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));

        Text = "NFe Agendamento - Consulta pela Fazenda";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 650);
        ClientSize = new Size(1100, 800);
        Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);

        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 78,
            Padding = new Padding(16, 12, 16, 8),
            BackColor = Color.White,
        };

        var title = new Label
        {
            AutoSize = true,
            Text = "Consulta alternativa no Portal Nacional da NF-e",
            Font = new Font("Segoe UI Semibold", 12F, FontStyle.Bold, GraphicsUnit.Point),
            Location = new Point(16, 10),
            ForeColor = Color.FromArgb(20, 52, 86),
            BackColor = Color.Transparent,
        };

        _status = new Label
        {
            AutoEllipsis = true,
            Text = "A chave será preenchida automaticamente. Resolva o hCaptcha manualmente e clique em Consultar.",
            Location = new Point(17, 41),
            Size = new Size(940, 24),
            ForeColor = Color.FromArgb(65, 72, 82),
            BackColor = Color.Transparent,
        };

        var closeButton = new Button
        {
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            Text = "Fechar",
            Size = new Size(80, 32),
            Location = new Point(1000, 22),
        };
        closeButton.Click += (_, _) => Close();

        header.Controls.Add(title);
        header.Controls.Add(_status);
        header.Controls.Add(closeButton);

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.White,
        };

        Controls.Add(_webView);
        Controls.Add(header);

        Shown += async (_, _) => await InitializeBrowserAsync();
        FormClosing += OnFormClosing;
        FormClosed += (_, _) =>
        {
            DetachBrowserHandlers();
            CleanupTemporaryDownload();
        };
    }

    public int ExitCode { get; private set; } = 2;

    public string CertificateThumbprint => _options.CertificateThumbprint;

    private async Task InitializeBrowserAsync()
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "NfeAgendamentoBridge",
                "webview2");
            Directory.CreateDirectory(userDataFolder);

            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userDataFolder);
            await _webView.EnsureCoreWebView2Async(environment);

            var core = _webView.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = true;
            core.NavigationStarting += CoreNavigationStarting;
            core.NavigationCompleted += CoreNavigationCompleted;
            core.NewWindowRequested += CoreNewWindowRequested;
            core.ClientCertificateRequested += CoreClientCertificateRequested;
            core.DownloadStarting += CoreDownloadStarting;
            core.Navigate(PortalUrl);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            FailAndClose("O Microsoft Edge WebView2 Runtime não está instalado neste computador.");
        }
        catch (Exception exception) when (
            IsBrowserLifecycleException(exception) ||
            exception is IOException or UnauthorizedAccessException)
        {
            FailAndClose(exception.Message);
        }
    }

    private void CoreNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (IsAllowedTopLevelUri(e.Uri)) return;

        e.Cancel = true;
        SetStatus("A navegação externa foi bloqueada. Esta janela aceita somente o Portal Nacional da NF-e.", error: true);
    }

    private async void CoreNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess || _webView.CoreWebView2 is null || !IsOfficialPortalUri(_webView.Source?.AbsoluteUri))
            return;

        try
        {
            var script =
                "(() => {" +
                "const input = document.querySelector('#ctl00_ContentPlaceHolder1_txtChaveAcessoResumo, input[id$=\"txtChaveAcessoResumo\"]');" +
                "if (!input) return false;" +
                $"if (!input.value) input.value = '{_options.AccessKey}';" +
                "input.dispatchEvent(new Event('input', { bubbles: true }));" +
                "input.dispatchEvent(new Event('change', { bubbles: true }));" +
                "input.focus();" +
                "return true;" +
                "})();";
            await _webView.CoreWebView2.ExecuteScriptAsync(script);
        }
        catch (Exception exception) when (IsBrowserLifecycleException(exception))
        {
        }
    }

    private void CoreNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        if (!IsOfficialPortalUri(e.Uri))
        {
            SetStatus("Uma tentativa de abrir conteúdo externo foi bloqueada.", error: true);
            return;
        }

        try
        {
            _webView.CoreWebView2.Navigate(e.Uri);
        }
        catch (Exception exception) when (IsBrowserLifecycleException(exception))
        {
        }
    }

    private void CoreClientCertificateRequested(object? sender, CoreWebView2ClientCertificateRequestedEventArgs e)
    {
        if (!IsOfficialHost(e.Host))
        {
            e.Cancel = true;
            e.Handled = true;
            SetStatus("Uma solicitação de certificado fora do Portal Nacional foi bloqueada.", error: true);
            return;
        }

        CoreWebView2ClientCertificate? selected = null;
        foreach (var candidate in e.MutuallyTrustedCertificates)
        {
            try
            {
                using var certificate = candidate.ToX509Certificate2();
                if (string.Equals(
                    PortalArguments.NormalizeThumbprint(certificate.Thumbprint),
                    CertificateThumbprint,
                    StringComparison.Ordinal))
                {
                    selected = candidate;
                    break;
                }
            }
            catch (CryptographicException)
            {
            }
        }

        e.Handled = true;
        if (selected is null)
        {
            SetStatus("O certificado selecionado no NFe Agendamento não foi aceito pelo Portal para este download.", error: true);
            return;
        }

        e.SelectedCertificate = selected;
        SetStatus("Certificado selecionado. Aguardando o XML oficial da Fazenda...");
    }

    private void CoreDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
    {
        if (!IsOfficialXmlDownload(e.DownloadOperation.Uri))
        {
            e.Cancel = true;
            e.Handled = true;
            SetStatus("Um download que não corresponde ao XML oficial da NF-e foi bloqueado.", error: true);
            return;
        }

        if (_downloadInProgress)
        {
            e.Cancel = true;
            e.Handled = true;
            SetStatus("Já existe um download de XML em andamento nesta janela.", error: true);
            return;
        }

        _downloadInProgress = true;
        var directory = Path.Combine(Path.GetTempPath(), "NfeAgendamento", "portal-download");
        Directory.CreateDirectory(directory);
        _temporaryDownloadPath = Path.Combine(directory, $"{_options.AccessKey}-{Guid.NewGuid():N}.xml");

        e.ResultFilePath = _temporaryDownloadPath;
        e.Handled = true;

        var operation = e.DownloadOperation;
        EventHandler<object>? stateChanged = null;
        stateChanged = async (_, _) =>
        {
            if (operation.State == CoreWebView2DownloadState.InProgress) return;
            if (stateChanged is not null) operation.StateChanged -= stateChanged;

            try
            {
                if (operation.State == CoreWebView2DownloadState.Completed)
                {
                    await ImportDownloadedXmlAsync(_temporaryDownloadPath);
                    return;
                }

                _downloadInProgress = false;
                CleanupTemporaryDownload();
                SetStatus($"O download do XML foi interrompido ({operation.InterruptReason}). Tente novamente pelo Portal.", error: true);
            }
            catch (Exception exception) when (IsBrowserLifecycleException(exception))
            {
                _downloadInProgress = false;
                CleanupTemporaryDownload();
            }
        };
        operation.StateChanged += stateChanged;
        SetStatus("Download oficial iniciado. Validando o XML...");
    }

    private async Task ImportDownloadedXmlAsync(string? path)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
                throw new InvalidDataException("O Portal não gerou um arquivo XML utilizável.");

            var info = new FileInfo(path);
            if (info.Length <= 0 || info.Length > MaxXmlBytes)
                throw new InvalidDataException("O XML baixado pelo Portal possui tamanho inválido.");

            var xml = await File.ReadAllTextAsync(path, Encoding.UTF8);
            ValidateDownloadedXml(xml, _options.AccessKey);
            await WriteResultAtomicallyAsync(xml);

            _finalized = true;
            ExitCode = 0;
            TryDelete(_options.ErrorPath);
            SetStatus("XML validado. Retornando ao site...");
            Close();
        }
        catch (Exception exception) when (
            exception is InvalidDataException or IOException or UnauthorizedAccessException or XmlException)
        {
            SetStatus(exception.Message, error: true);
            MessageBox.Show(
                this,
                exception.Message,
                "XML não importado",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
        finally
        {
            _downloadInProgress = false;
            CleanupTemporaryDownload();
        }
    }

    private async Task WriteResultAtomicallyAsync(string xml)
    {
        var directory = Path.GetDirectoryName(_options.ResultPath)
            ?? throw new InvalidDataException("Caminho de retorno do Portal inválido.");
        Directory.CreateDirectory(directory);

        var temporary = _options.ResultPath + $".{Guid.NewGuid():N}.tmp";
        try
        {
            await File.WriteAllTextAsync(temporary, xml, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            File.Move(temporary, _options.ResultPath, overwrite: true);
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_finalized) return;

        _finalized = true;
        ExitCode = 2;
        PortalArguments.TryWriteError(_options.ErrorPath, "Portal fechado pelo usuário.");
    }

    private void FailAndClose(string message)
    {
        if (_finalized) return;

        _finalized = true;
        ExitCode = 1;
        PortalArguments.TryWriteError(_options.ErrorPath, message);
        SetStatus(message, error: true);
        MessageBox.Show(this, message, "Portal da NF-e", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Close();
    }

    private void SetStatus(string message, bool error = false)
    {
        if (IsDisposed || Disposing) return;

        if (InvokeRequired)
        {
            try
            {
                BeginInvoke(new Action(() => SetStatus(message, error)));
            }
            catch (Exception exception) when (IsBrowserLifecycleException(exception))
            {
            }
            return;
        }

        _status.Text = message;
        _status.ForeColor = error ? Color.Firebrick : Color.FromArgb(65, 72, 82);
    }

    private void DetachBrowserHandlers()
    {
        try
        {
            var core = _webView.CoreWebView2;
            if (core is null) return;

            core.NavigationStarting -= CoreNavigationStarting;
            core.NavigationCompleted -= CoreNavigationCompleted;
            core.NewWindowRequested -= CoreNewWindowRequested;
            core.ClientCertificateRequested -= CoreClientCertificateRequested;
            core.DownloadStarting -= CoreDownloadStarting;
        }
        catch (Exception exception) when (IsBrowserLifecycleException(exception))
        {
        }
    }

    private void CleanupTemporaryDownload()
    {
        var path = _temporaryDownloadPath;
        _temporaryDownloadPath = null;
        if (!string.IsNullOrWhiteSpace(path)) TryDelete(path);
    }

    private static void ValidateDownloadedXml(string xml, string accessKey)
    {
        if (string.IsNullOrWhiteSpace(xml) || Encoding.UTF8.GetByteCount(xml) > MaxXmlBytes)
            throw new InvalidDataException("O XML baixado pelo Portal possui tamanho inválido.");

        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = MaxXmlBytes,
        };

        XDocument document;
        using (var textReader = new StringReader(xml))
        using (var reader = XmlReader.Create(textReader, settings))
            document = XDocument.Load(reader, LoadOptions.None);

        if (!string.Equals(document.Root?.Name.LocalName, "nfeProc", StringComparison.Ordinal))
            throw new InvalidDataException("O arquivo baixado não contém um XML processado de NF-e reconhecido.");

        var infNFe = document.Descendants().FirstOrDefault(element => element.Name.LocalName == "infNFe")
            ?? throw new InvalidDataException("O XML baixado não contém a identificação da NF-e.");

        if (!string.Equals(infNFe.Attribute("Id")?.Value, "NFe" + accessKey, StringComparison.Ordinal))
            throw new InvalidDataException("O XML baixado não corresponde à chave NF-e consultada.");
    }

    private static bool IsBrowserLifecycleException(Exception exception)
    {
        if (exception is ObjectDisposedException or InvalidOperationException) return true;
        if (exception is not COMException comException) return false;
        return comException.HResult is RpcEDisconnected or RoEClosed or EAbort;
    }

    private static bool IsAllowedTopLevelUri(string? uri) =>
        string.Equals(uri, "about:blank", StringComparison.OrdinalIgnoreCase) || IsOfficialPortalUri(uri);

    private static bool IsOfficialPortalUri(string? uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var parsed) &&
        string.Equals(parsed.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
        IsOfficialHost(parsed.Host);

    private static bool IsOfficialXmlDownload(string? uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var parsed) &&
        string.Equals(parsed.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
        IsOfficialHost(parsed.Host) &&
        string.Equals(parsed.AbsolutePath, "/portal/downloadNFe.aspx", StringComparison.OrdinalIgnoreCase);

    private static bool IsOfficialHost(string? host) =>
        string.Equals(host, OfficialHost, StringComparison.OrdinalIgnoreCase);

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
