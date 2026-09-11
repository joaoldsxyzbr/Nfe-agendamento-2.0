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
    public void Windows_helper_wires_WebView2_to_the_hardened_portal_flow()
    {
        var project = RepositoryFile("apps", "bridge", "windows", "NfeAgendamento.Portal", "NfeAgendamento.Portal.csproj");
        var window = RepositoryFile("apps", "bridge", "windows", "NfeAgendamento.Portal", "PortalWindow.cs");

        Assert.Contains("net10.0-windows", project);
        Assert.Contains("Microsoft.Web.WebView2", project);
        Assert.Contains("PortalSecurityPolicy.PortalUrl", window);
        Assert.Contains("NavigationStarting", window);
        Assert.Contains("NewWindowRequested", window);
        Assert.Contains("ClientCertificateRequested", window);
        Assert.Contains("DownloadStarting", window);
        Assert.Contains("CertificateThumbprint", window);
        Assert.Contains("hCaptcha", window);
        Assert.Contains("manual", window, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("hcaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("grecaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Windows_helper_delegates_security_decisions_to_behaviorally_tested_policy()
    {
        var window = RepositoryFile("apps", "bridge", "windows", "NfeAgendamento.Portal", "PortalWindow.cs");

        Assert.Contains("h-captcha-response", window);
        Assert.Contains("ctl00_ContentPlaceHolder1_btnConsultarHCaptcha", window);
        Assert.Contains("startsWith('download do documento')", window, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("DownloadProbeAttempts", window);
        Assert.Contains("ScriptDialogOpening", window);
        Assert.Contains("AreDefaultScriptDialogsEnabled = false", window);
        Assert.Contains("CoreWebView2ScriptDialogKind.Confirm", window);
        Assert.Contains("CoreWebView2ScriptDialogKind.Alert", window);
        Assert.Contains("PortalSecurityPolicy.IsExpectedDialogContext", window);
        Assert.Contains("PortalSecurityPolicy.IsExpectedDownloadConfirmation", window);
        Assert.Contains("PortalSecurityPolicy.CreateTemporaryDownloadPath", window);
        Assert.DoesNotContain("$\"{accessKey}-{Guid.NewGuid():N}.xml\"", window);
        Assert.DoesNotContain("Task.Delay(1500)", window);
        Assert.DoesNotContain("hcaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("grecaptcha.execute", window, StringComparison.OrdinalIgnoreCase);
    }
}
