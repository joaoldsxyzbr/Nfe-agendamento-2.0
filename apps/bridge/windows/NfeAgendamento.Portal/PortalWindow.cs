using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using NfeAgendamento.Bridge.Portal;

namespace NfeAgendamento.Portal;

internal sealed class PortalWindow : Form, IPortalServerOperationRunner
{
    private const string OfficialHost = "www.nfe.fazenda.gov.br";
    private const string PortalUrl = "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g%3D";
    private const long MaxXmlBytes = 10L * 1024 * 1024;
    private const int DownloadProbeAttempts = 2400;
    private const int RpcEDisconnected = unchecked((int)0x80010108);
    private const int RoEClosed = unchecked((int)0x80000013);
    private const int EAbort = unchecked((int)0x80004004);
    private static readonly TimeSpan ExpectedPortalDialogWindow = TimeSpan.FromSeconds(60);

    private readonly PortalOptions? _legacyOptions;
    private readonly bool _serverMode;
    private readonly WebView2 _webView;
    private readonly Label _status;
    private Task? _browserPreparation;
    private PortalLaunchRequest? _activeRequest;
    private TaskCompletionSource<PortalLaunchResult>? _activeCompletion;
    private string? _temporaryDownloadPath;
    private bool _downloadInProgress;
    private bool _acceptExpectedPortalDialog;
    private DateTime _expectedPortalDialogDeadlineUtc;
    private bool _legacyFinalized;
    private bool _allowRealClose;

    public PortalWindow(PortalOptions options)
        : this(serverMode: false)
    {
        _legacyOptions = options ?? throw new ArgumentNullException(nameof(options));
        Shown += async (_, _) =>
        {
            try
            {
                await PrepareAsync();
            }
            catch (Exception exception) when (IsExpectedPortalException(exception))
            {
                FailLegacyAndClose(UserFriendlyBrowserMessage(exception));
            }
        };
    }

    private PortalWindow(bool serverMode)
    {
        _serverMode = serverMode;

        Text = "NFe Agendamento - Consulta pela Fazenda";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(900, 650);
        ClientSize = new Size(1100, 800);
        Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
        ShowInTaskbar = !serverMode;

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
            Text = "A chave será preenchida automaticamente. Resolva o hCaptcha; depois disso o fluxo continua sozinho.",
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

        FormClosing += OnFormClosing;
        FormClosed += (_, _) =>
        {
            DetachBrowserHandlers();
            CleanupTemporaryDownload();
        };
    }

    public static PortalWindow CreateServerWindow() => new(serverMode: true);

    public int ExitCode { get; private set; } = 2;

    private string CurrentAccessKey => _activeRequest?.AccessKey ?? _legacyOptions?.AccessKey ?? string.Empty;
    private string CertificateThumbprint => _activeRequest?.CertificateThumbprint ?? _legacyOptions?.CertificateThumbprint ?? string.Empty;

    public Task PrepareAsync()
    {
        if (_browserPreparation is not null) return _browserPreparation;
        _browserPreparation = InitializeBrowserAsync();
        return _browserPreparation;
    }

    public async Task<PortalLaunchResult> RunAsync(
        PortalLaunchRequest request,
        CancellationToken cancellationToken)
    {
        if (!_serverMode)
            throw new InvalidOperationException("Esta janela não está no modo persistente.");
        ArgumentNullException.ThrowIfNull(request);
        if (_activeCompletion is not null)
            return PortalLaunchResult.Failed("Já existe uma operação Portal ativa nesta janela.");

        await PrepareAsync();
        cancellationToken.ThrowIfCancellationRequested();

        CleanupTemporaryDownload();
        _downloadInProgress = false;
        _acceptExpectedPortalDialog = false;
        _expectedPortalDialogDeadlineUtc = default;
        _activeRequest = request;
        _activeCompletion = new TaskCompletionSource<PortalLaunchResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        SetStatus("Chave preenchida automaticamente. Resolva o hCaptcha; depois disso o restante é automático.");

        ShowInTaskbar = true;
        if (!Visible) Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        BringToFront();
        Activate();

        _webView.CoreWebView2.Navigate(PortalUrl);

        using var registration = cancellationToken.Register(() =>
        {
            try
            {
                if (IsHandleCreated && !IsDisposed)
                    BeginInvoke(new Action(() => CompleteServerOperation(
                        PortalLaunchResult.Cancelled("Consulta pelo Portal cancelada."))));
            }
            catch (Exception exception) when (IsBrowserLifecycleException(exception))
            {
            }
        });

        return await _activeCompletion.Task;
    }

    public void Shutdown()
    {
        _allowRealClose = true;
        _activeCompletion?.TrySetResult(PortalLaunchResult.Failed("Helper do Portal encerrado."));
        Close();
    }

    private async Task InitializeBrowserAsync()
    {
        if (!IsHandleCreated) CreateControl();
        if (!_webView.IsHandleCreated) _webView.CreateControl();

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
        core.Settings.AreDefaultScriptDialogsEnabled = false;
        core.Settings.IsStatusBarEnabled = true;
        core.NavigationStarting += CoreNavigationStarting;
        core.NavigationCompleted += CoreNavigationCompleted;
        core.NewWindowRequested += CoreNewWindowRequested;
        core.ScriptDialogOpening += CoreScriptDialogOpening;
        core.ClientCertificateRequested += CoreClientCertificateRequested;
        core.DownloadStarting += CoreDownloadStarting;
        core.Navigate(PortalUrl);
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

        var accessKey = CurrentAccessKey;
        if (string.IsNullOrWhiteSpace(accessKey)) return;

        try
        {
            await FillAccessKeyAsync(accessKey);

            if (await TryClickOfficialDownloadAsync())
                return;

            if (IsOfficialConsultPage(_webView.Source?.AbsoluteUri))
                await InstallManualCaptchaAutoContinueAsync(accessKey);

            for (var attempt = 0; attempt < DownloadProbeAttempts; attempt++)
            {
                await Task.Delay(250);
                if (!string.Equals(CurrentAccessKey, accessKey, StringComparison.Ordinal) || _downloadInProgress)
                    return;
                if (await TryClickOfficialDownloadAsync())
                    return;
            }
        }
        catch (Exception exception) when (IsBrowserLifecycleException(exception))
        {
        }
    }

    private Task FillAccessKeyAsync(string accessKey)
    {
        var script = $$"""
            (() => {
                const input = document.querySelector('#ctl00_ContentPlaceHolder1_txtChaveAcessoResumo, input[id$="txtChaveAcessoResumo"]');
                if (!input) return false;
                input.value = '{{accessKey}}';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.focus();
                return true;
            })();
            """;
        return _webView.CoreWebView2.ExecuteScriptAsync(script);
    }

    private Task InstallManualCaptchaAutoContinueAsync(string accessKey)
    {
        var script = $$"""
            (() => {
                const expectedKey = '{{accessKey}}';
                const findKeyInput = () => document.querySelector('#ctl00_ContentPlaceHolder1_txtChaveAcessoResumo, input[id$="txtChaveAcessoResumo"]');
                const findContinueButton = () => document.querySelector('#ctl00_ContentPlaceHolder1_btnConsultarHCaptcha, #ctl00_ContentPlaceHolder1_btnConsultar');
                const input = findKeyInput();
                const button = findContinueButton();
                if (!input || !button) return false;

                const writeKey = () => {
                    const currentInput = findKeyInput();
                    if (!currentInput) return false;
                    if (currentInput.value !== expectedKey) {
                        currentInput.value = expectedKey;
                        currentInput.dispatchEvent(new Event('input', { bubbles: true }));
                        currentInput.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    return true;
                };

                writeKey();
                if (window.__nfeAgendamentoCaptchaWatcher === true) return true;
                window.__nfeAgendamentoCaptchaWatcher = true;

                const tryContinue = () => {
                    const response = document.getElementsByName('h-captcha-response')[0];
                    if (!response || !String(response.value || '').trim()) return false;
                    const currentButton = findContinueButton();
                    if (!currentButton || currentButton.disabled || !writeKey()) return false;
                    window.__nfeAgendamentoCaptchaWatcher = false;
                    currentButton.click();
                    return true;
                };

                if (tryContinue()) return true;

                const timer = window.setInterval(() => {
                    if (window.__nfeAgendamentoCaptchaWatcher !== true || tryContinue())
                        window.clearInterval(timer);
                }, 250);

                window.addEventListener('pagehide', () => {
                    window.__nfeAgendamentoCaptchaWatcher = false;
                    window.clearInterval(timer);
                }, { once: true });

                return true;
            })();
            """;
        return _webView.CoreWebView2.ExecuteScriptAsync(script);
    }

    private async Task<bool> TryClickOfficialDownloadAsync()
    {
        if (_downloadInProgress || string.IsNullOrWhiteSpace(CurrentAccessKey))
            return false;

        const string probeScript = """
            (() => {
                const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
                const isDownloadLabel = (element) => normalize(element.value || element.textContent).startsWith('download do documento');
                const controls = Array.from(document.querySelectorAll('a[href], button, input[type="button"], input[type="submit"]'));
                const direct = controls.find((element) => {
                    if (element.tagName !== 'A' || !element.href) return false;
                    try {
                        const target = new URL(element.href, location.href);
                        return target.protocol === 'https:' &&
                            target.hostname.toLowerCase() === 'www.nfe.fazenda.gov.br' &&
                            target.pathname.toLowerCase() === '/portal/downloadnfe.aspx';
                    } catch {
                        return false;
                    }
                });
                if (direct) return true;
                return controls.some(isDownloadLabel);
            })();
            """;

        var available = await _webView.CoreWebView2.ExecuteScriptAsync(probeScript);
        if (!string.Equals(available, "true", StringComparison.Ordinal))
            return false;

        const string clickScript = """
            (() => {
                const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
                const isDownloadLabel = (element) => normalize(element.value || element.textContent).startsWith('download do documento');
                const controls = Array.from(document.querySelectorAll('a[href], button, input[type="button"], input[type="submit"]'));
                let target = controls.find((element) => {
                    if (element.tagName !== 'A' || !element.href) return false;
                    try {
                        const uri = new URL(element.href, location.href);
                        return uri.protocol === 'https:' &&
                            uri.hostname.toLowerCase() === 'www.nfe.fazenda.gov.br' &&
                            uri.pathname.toLowerCase() === '/portal/downloadnfe.aspx';
                    } catch {
                        return false;
                    }
                });
                target ??= controls.find(isDownloadLabel);
                if (!target || target.dataset.nfeAgendamentoAutoDownload === '1') return false;
                target.dataset.nfeAgendamentoAutoDownload = '1';
                target.click();
                return true;
            })();
            """;

        _acceptExpectedPortalDialog = true;
        _expectedPortalDialogDeadlineUtc = DateTime.UtcNow.Add(ExpectedPortalDialogWindow);
        var clicked = await _webView.CoreWebView2.ExecuteScriptAsync(clickScript);
        if (!string.Equals(clicked, "true", StringComparison.Ordinal))
        {
            _acceptExpectedPortalDialog = false;
            _expectedPortalDialogDeadlineUtc = default;
            return false;
        }

        SetStatus("Consulta concluída. Solicitando o XML oficial automaticamente...");
        return true;
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

    private void CoreScriptDialogOpening(object? sender, CoreWebView2ScriptDialogOpeningEventArgs e)
    {
        if (!_acceptExpectedPortalDialog ||
            DateTime.UtcNow > _expectedPortalDialogDeadlineUtc ||
            string.IsNullOrWhiteSpace(CurrentAccessKey) ||
            !IsOfficialPortalUri(e.Uri))
            return;

        if (e.Kind != CoreWebView2ScriptDialogKind.Confirm &&
            e.Kind != CoreWebView2ScriptDialogKind.Alert)
            return;

        var message = e.Message ?? string.Empty;
        if (!message.Contains("download", StringComparison.OrdinalIgnoreCase) ||
            !message.Contains("certificado digital", StringComparison.OrdinalIgnoreCase))
            return;

        _acceptExpectedPortalDialog = false;
        _expectedPortalDialogDeadlineUtc = default;
        e.Accept();
        SetStatus("Confirmação do Portal aceita. Aguardando o certificado e o XML oficial...");
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

        if (string.IsNullOrWhiteSpace(CertificateThumbprint))
        {
            e.Cancel = true;
            e.Handled = true;
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
        _acceptExpectedPortalDialog = false;
        _expectedPortalDialogDeadlineUtc = default;
        var accessKey = CurrentAccessKey;
        if (string.IsNullOrWhiteSpace(accessKey))
        {
            e.Cancel = true;
            e.Handled = true;
            return;
        }

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
        _temporaryDownloadPath = Path.Combine(directory, $"{accessKey}-{Guid.NewGuid():N}.xml");

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

            var accessKey = CurrentAccessKey;
            if (string.IsNullOrWhiteSpace(accessKey))
                throw new InvalidDataException("A operação atual do Portal não possui chave NF-e válida.");

            var xml = await File.ReadAllTextAsync(path, Encoding.UTF8);
            ValidateDownloadedXml(xml, accessKey);

            if (_serverMode)
            {
                SetStatus("XML validado. Retornando ao site...");
                CompleteServerOperation(PortalLaunchResult.Completed(xml));
                return;
            }

            await WriteLegacyResultAtomicallyAsync(xml);
            _legacyFinalized = true;
            ExitCode = 0;
            TryDelete(_legacyOptions!.ErrorPath);
            SetStatus("XML validado. Retornando ao site...");
            Close();
        }
        catch (Exception exception) when (
            exception is InvalidDataException or IOException or UnauthorizedAccessException or XmlException)
        {
            SetStatus(exception.Message, error: true);
            if (_serverMode)
            {
                CompleteServerOperation(PortalLaunchResult.Failed(exception.Message));
            }
            else
            {
                MessageBox.Show(
                    this,
                    exception.Message,
                    "XML não importado",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }
        finally
        {
            _downloadInProgress = false;
            CleanupTemporaryDownload();
        }
    }

    private async Task WriteLegacyResultAtomicallyAsync(string xml)
    {
        var directory = Path.GetDirectoryName(_legacyOptions!.ResultPath)
            ?? throw new InvalidDataException("Caminho de retorno do Portal inválido.");
        Directory.CreateDirectory(directory);

        var temporary = _legacyOptions.ResultPath + $".{Guid.NewGuid():N}.tmp";
        try
        {
            await File.WriteAllTextAsync(temporary, xml, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
            File.Move(temporary, _legacyOptions.ResultPath, overwrite: true);
        }
        finally
        {
            TryDelete(temporary);
        }
    }

    private void CompleteServerOperation(PortalLaunchResult result)
    {
        if (!_serverMode) return;
        var completion = _activeCompletion;
        if (completion is null) return;

        _activeCompletion = null;
        _activeRequest = null;
        _downloadInProgress = false;
        _acceptExpectedPortalDialog = false;
        _expectedPortalDialogDeadlineUtc = default;
        CleanupTemporaryDownload();
        Hide();
        ShowInTaskbar = false;
        completion.TrySetResult(result);
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_allowRealClose) return;

        if (_serverMode)
        {
            e.Cancel = true;
            if (_activeCompletion is not null)
                CompleteServerOperation(PortalLaunchResult.Cancelled("Portal fechado pelo usuário."));
            else
                Hide();
            return;
        }

        if (_legacyFinalized) return;

        _legacyFinalized = true;
        ExitCode = 2;
        PortalArguments.TryWriteError(_legacyOptions!.ErrorPath, "Portal fechado pelo usuário.");
    }

    private void FailLegacyAndClose(string message)
    {
        if (_legacyFinalized) return;

        _legacyFinalized = true;
        ExitCode = 1;
        PortalArguments.TryWriteError(_legacyOptions!.ErrorPath, message);
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
            core.ScriptDialogOpening -= CoreScriptDialogOpening;
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

    private static string UserFriendlyBrowserMessage(Exception exception) =>
        exception is WebView2RuntimeNotFoundException
            ? "O Microsoft Edge WebView2 Runtime não está instalado neste computador."
            : exception.Message;

    private static bool IsExpectedPortalException(Exception exception) =>
        exception is WebView2RuntimeNotFoundException
        or IOException
        or UnauthorizedAccessException
        or COMException
        or InvalidOperationException;

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

    private static bool IsOfficialConsultPage(string? uri) =>
        Uri.TryCreate(uri, UriKind.Absolute, out var parsed) &&
        string.Equals(parsed.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
        IsOfficialHost(parsed.Host) &&
        string.Equals(parsed.AbsolutePath, "/portal/consultaRecaptcha.aspx", StringComparison.OrdinalIgnoreCase);

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
