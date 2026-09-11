using System.Text.RegularExpressions;
using NfeAgendamento.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalSecurityPolicyTests
{
    [Theory]
    [InlineData("https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx", true)]
    [InlineData("https://WWW.NFE.FAZENDA.GOV.BR/portal/consultaRecaptcha.aspx", true)]
    [InlineData("http://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx", false)]
    [InlineData("https://nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx", false)]
    [InlineData("https://www.nfe.fazenda.gov.br.example.org/portal/consultaRecaptcha.aspx", false)]
    [InlineData("not-a-uri", false)]
    public void Portal_uri_requires_exact_official_https_host(string uri, bool expected)
    {
        Assert.Equal(expected, PortalSecurityPolicy.IsOfficialPortalUri(uri));
    }

    [Theory]
    [InlineData("about:blank", true)]
    [InlineData("https://www.nfe.fazenda.gov.br/portal/qualquer-pagina.aspx", true)]
    [InlineData("https://example.org/", false)]
    public void Top_level_navigation_is_restricted(string uri, bool expected)
    {
        Assert.Equal(expected, PortalSecurityPolicy.IsAllowedTopLevelUri(uri));
    }

    [Theory]
    [InlineData("https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?x=1", true)]
    [InlineData("https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx/extra", false)]
    [InlineData("https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx", false)]
    public void Consultation_page_requires_exact_path(string uri, bool expected)
    {
        Assert.Equal(expected, PortalSecurityPolicy.IsOfficialConsultPage(uri));
    }

    [Theory]
    [InlineData("https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx", true)]
    [InlineData("https://www.nfe.fazenda.gov.br/PORTAL/DOWNLOADNFE.ASPX?x=1", true)]
    [InlineData("https://www.nfe.fazenda.gov.br/portal/downloadNFe.aspx/extra", false)]
    [InlineData("https://example.org/portal/downloadNFe.aspx", false)]
    public void Xml_download_requires_exact_official_endpoint(string uri, bool expected)
    {
        Assert.Equal(expected, PortalSecurityPolicy.IsOfficialXmlDownload(uri));
    }

    [Theory]
    [InlineData("Confirma o download usando certificado digital?", true)]
    [InlineData("DOWNLOAD com CERTIFICADO DIGITAL", true)]
    [InlineData("Confirma o download?", false)]
    [InlineData("Usar certificado digital?", false)]
    [InlineData("", false)]
    public void Dialog_confirmation_requires_both_expected_signals(string message, bool expected)
    {
        Assert.Equal(expected, PortalSecurityPolicy.IsExpectedDownloadConfirmation(message));
    }

    [Fact]
    public void Dialog_context_requires_armed_unexpired_operation_with_key_and_official_origin()
    {
        var now = new DateTime(2026, 9, 11, 12, 0, 0, DateTimeKind.Utc);
        var deadline = now.AddSeconds(60);
        var accessKey = new string('1', 44);
        const string officialUri = "https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx";

        Assert.True(PortalSecurityPolicy.IsExpectedDialogContext(true, now, deadline, accessKey, officialUri));
        Assert.True(PortalSecurityPolicy.IsExpectedDialogContext(true, deadline, deadline, accessKey, officialUri));
        Assert.False(PortalSecurityPolicy.IsExpectedDialogContext(false, now, deadline, accessKey, officialUri));
        Assert.False(PortalSecurityPolicy.IsExpectedDialogContext(true, deadline.AddTicks(1), deadline, accessKey, officialUri));
        Assert.False(PortalSecurityPolicy.IsExpectedDialogContext(true, now, deadline, "", officialUri));
        Assert.False(PortalSecurityPolicy.IsExpectedDialogContext(true, now, deadline, accessKey, "https://example.org/"));
    }

    [Fact]
    public void Temporary_download_name_is_random_and_contains_no_fiscal_identifier()
    {
        var directory = Path.Combine(Path.GetTempPath(), "NfeAgendamento-tests");

        var first = PortalSecurityPolicy.CreateTemporaryDownloadPath(directory);
        var second = PortalSecurityPolicy.CreateTemporaryDownloadPath(directory);

        Assert.Equal(directory, Path.GetDirectoryName(first));
        Assert.NotEqual(first, second);
        Assert.DoesNotMatch(new Regex("[0-9]{44}", RegexOptions.CultureInvariant), first);
        Assert.Matches(new Regex("^[0-9a-f]{32}\\.xml$", RegexOptions.CultureInvariant), Path.GetFileName(first));
    }
}
