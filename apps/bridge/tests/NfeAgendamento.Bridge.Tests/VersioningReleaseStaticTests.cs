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
        var props = File.ReadAllText(propsPath);
        Assert.Contains("<Version>0.0.6</Version>", props);

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
        Assert.DoesNotContain("0.0.6", installer);
        Assert.Contains("#ifndef MyAppVersion", installer);
        Assert.Contains("OutputBaseFilename=NFeAgendamentoBridge-Setup-v{#MyAppVersion}", installer);

        var ci = File.ReadAllText(Path.Combine(root, ".github", "workflows", "ci.yml"));
        Assert.Contains("Directory.Build.props", ci);
        Assert.DoesNotContain("NFeAgendamentoBridge-Setup-v0.0.6", ci);

        Assert.True(File.Exists(Path.Combine(root, ".github", "workflows", "release.yml")));
        for (var patch = 1; patch <= 6; patch++)
        {
            Assert.False(
                File.Exists(Path.Combine(root, ".github", "workflows", $"release-v0.0.{patch}.yml")),
                $"Workflow histórico release-v0.0.{patch}.yml deve ser removido.");
        }
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
