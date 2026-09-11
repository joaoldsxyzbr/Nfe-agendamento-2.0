using System.Text.RegularExpressions;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class WorkflowHardeningStaticTests
{
    [Fact]
    public void First_party_actions_are_pinned_to_immutable_commit_shas()
    {
        var root = RepositoryRoot();
        foreach (var workflowName in new[] { "ci.yml", "release.yml" })
        {
            var workflow = File.ReadAllText(Path.Combine(root, ".github", "workflows", workflowName));
            var matches = Regex.Matches(workflow, @"uses:\s+actions/[^\s@]+@([^\s#]+)");

            Assert.NotEmpty(matches);
            foreach (Match match in matches)
                Assert.Matches("^[0-9a-f]{40}$", match.Groups[1].Value);
        }
    }

    [Fact]
    public void Ci_uses_least_privilege_and_pinned_installer_tooling()
    {
        var ci = RepositoryFile(".github", "workflows", "ci.yml");

        Assert.Contains("contents: read", ci);
        Assert.Contains("persist-credentials: false", ci);
        Assert.Contains("./node_modules/.bin/wrangler deploy --dry-run", ci);
        Assert.Contains("$expectedVersion = \"6.7.1\"", ci);
        Assert.Contains("--require-checksums", ci);
        Assert.Contains("https://community.chocolatey.org/api/v2/", ci);
        Assert.Contains("scripts/sign-windows-artifacts.ps1", ci);
    }

    [Fact]
    public void Authenticode_script_fails_closed_when_partially_configured_and_cleans_up_credentials()
    {
        var script = RepositoryFile("scripts", "sign-windows-artifacts.ps1");

        Assert.Contains("CODE_SIGNING_PFX_BASE64", script);
        Assert.Contains("CODE_SIGNING_PFX_PASSWORD", script);
        Assert.Contains("Configuração Authenticode incompleta", script);
        Assert.Contains("Import-PfxCertificate", script);
        Assert.Contains("-Exportable:$false", script);
        Assert.Contains("1.3.6.1.5.5.7.3.3", script);
        Assert.Contains("/fd SHA256", script);
        Assert.Contains("/td SHA256", script);
        Assert.Contains("verify /pa", script);
        Assert.Contains("Remove-Item", script);
        Assert.DoesNotContain("/p $pfxPassword", script, StringComparison.OrdinalIgnoreCase);
    }

    private static string RepositoryFile(params string[] parts) =>
        File.ReadAllText(Path.Combine([RepositoryRoot(), .. parts]));

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "package.json")))
            directory = directory.Parent;

        Assert.NotNull(directory);
        return directory.FullName;
    }
}
