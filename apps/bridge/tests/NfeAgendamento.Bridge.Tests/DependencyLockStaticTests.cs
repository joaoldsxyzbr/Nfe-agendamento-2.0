using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class DependencyLockStaticTests
{
    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "package.json")))
            directory = directory.Parent;

        Assert.NotNull(directory);
        return directory.FullName;
    }

    [Fact]
    public void Package_reference_projects_use_committed_nuget_lockfiles_in_locked_mode()
    {
        var root = RepositoryRoot();
        var portalDirectory = Path.Combine(root, "apps", "bridge", "windows", "NfeAgendamento.Portal");
        var testsDirectory = Path.Combine(root, "apps", "bridge", "tests", "NfeAgendamento.Bridge.Tests");

        var portalProject = File.ReadAllText(Path.Combine(portalDirectory, "NfeAgendamento.Portal.csproj"));
        var testsProject = File.ReadAllText(Path.Combine(testsDirectory, "NfeAgendamento.Bridge.Tests.csproj"));

        Assert.Contains("<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>", portalProject);
        Assert.Contains("<RestoreLockedMode>true</RestoreLockedMode>", portalProject);
        Assert.Contains("<RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>", testsProject);
        Assert.Contains("<RestoreLockedMode>true</RestoreLockedMode>", testsProject);
        Assert.True(File.Exists(Path.Combine(portalDirectory, "packages.lock.json")), "Lockfile NuGet do Portal não foi commitado.");
        Assert.True(File.Exists(Path.Combine(testsDirectory, "packages.lock.json")), "Lockfile NuGet dos testes não foi commitado.");
    }
}
