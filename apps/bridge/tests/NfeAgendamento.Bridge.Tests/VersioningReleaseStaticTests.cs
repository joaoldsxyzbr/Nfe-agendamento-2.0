using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class VersioningReleaseStaticTests
{
    [Fact]
    public void Version_is_canonical_and_release_pipeline_is_generic()
    {
        var root = RepositoryRoot();
        var propsPath = Path.Combine(root, "Directory.Build.props");
        Assert.True(File.Exists(propsPath), "Directory.Build.props deve ser a fonte canônica da versão.");

        var document = System.Xml.Linq.XDocument.Load(propsPath);
        var version = Assert.Single(document.Descendants("Version")).Value.Trim();
        Assert.True(System.Version.TryParse(version, out _), $"Versão canônica inválida: {version}");

        var projectPaths = new[]
        {
            Path.Combine(root, "apps", "bridge", "src", "NfeAgendamento.Bridge", "NfeAgendamento.Bridge.csproj"),
            Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.App", "NfeAgendamento.App.csproj"),
            Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.Portal", "NfeAgendamento.Portal.csproj"),
        };

        foreach (var path in projectPaths)
        {
            var project = File.ReadAllText(path);
            Assert.DoesNotContain("<Version>", project);
            Assert.DoesNotContain("<FileVersion>", project);
            Assert.DoesNotContain("<AssemblyVersion>", project);
        }

        var installer = File.ReadAllText(Path.Combine(root, "apps", "bridge", "installer", "NfeAgendamentoBridge.iss"));
        Assert.DoesNotContain(version, installer);
        Assert.Contains("#ifndef MyAppVersion", installer);
        Assert.Contains("OutputBaseFilename=NFeAgendamentoBridge-Setup-v{#MyAppVersion}", installer);

        var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));
        Assert.Contains("Directory.Build.props", ci);
        Assert.DoesNotContain($"NFeAgendamentoBridge-Setup-v{version}", ci);

        var workflowsDirectory = Path.Combine(root, ".github", "workflows");
        Assert.True(File.Exists(Path.Combine(workflowsDirectory, "release.yml")));
        Assert.Empty(Directory.GetFiles(workflowsDirectory, "release-v*.yml", SearchOption.TopDirectoryOnly));
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "package.json")))
            directory = directory.Parent;

        Assert.NotNull(directory);
        return directory.FullName;
    }
}
