using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalHelperStaticTests
{
    private static string RepositoryFile(params string[] parts)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "package.json")))
            directory = directory.Parent;

        Assert.NotNull(directory);
        return File.ReadAllText(Path.Combine([directory.FullName, .. parts]));
    }

    [Fact]
    public void Windows_helper_is_locked_to_official_portal_and_manual_captcha()
    {
        var project = RepositoryFile("apps", "bridge", "windows", "NfeAgendamento.Portal", "NfeAgendamento.Portal.csproj");
        var window = RepositoryFile("apps", "bridge", "windows", "NfeAgendamento.Portal", "PortalWindow.cs");

        Assert.Contains("net10.0-windows", project);
        Assert.Contains("Microsoft.Web.WebView2", project);
        Assert.Contains("www.nfe.fazenda.gov.br", window);
        Assert.Contains("consultaRecaptcha.aspx", window);
        Assert.Contains("NavigationStarting", window);
        Assert.Contains("NewWindowRequested", window);
        Assert.Contains("ClientCertificateRequested", window);
        Assert.Contains("DownloadStarting", window);
        Assert.Contains("downloadNFe.aspx", window);
        Assert.Contains("CertificateThumbprint", window);
        Assert.Contains("hCaptcha", window);
        Assert.Contains("manual", window, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hcaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("grecaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Windows_helper_only_auto_advances_after_manual_captcha_and_scoped_download_action()
    {
        var window = RepositoryFile("apps", "bridge", "windows", "NfeAgendamento.Portal", "PortalWindow.cs");

        Assert.Contains("h-captcha-response", window);
        Assert.Contains("ctl00_ContentPlaceHolder1_btnConsultarHCaptcha", window);
        Assert.Contains("download do documento", window, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("/portal/downloadnfe.aspx", window, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ScriptDialogOpening", window);
        Assert.Contains("CoreWebView2ScriptDialogKind.Confirm", window);
        Assert.Contains("CoreWebView2ScriptDialogKind.Alert", window);
        Assert.Contains("_acceptExpectedPortalDialog", window);
        Assert.DoesNotContain("hcaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("grecaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
    }
}
