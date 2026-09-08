using System.Reflection;
using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class ProcessPortalWindowLauncherTests
{
    [Fact]
    public void Launcher_exposes_runtime_probe_test_seam_without_opening_portal()
    {
        var constructor = RuntimeProbeConstructor();

        Assert.NotNull(constructor);
    }

    [Fact]
    public void IsAvailable_is_false_when_helper_exists_but_runtime_probe_fails()
    {
        var helper = Path.GetTempFileName();
        try
        {
            var launcher = CreateLauncher(helper, _ => false);

            Assert.False(launcher.IsAvailable);
        }
        finally
        {
            File.Delete(helper);
        }
    }

    [Fact]
    public void IsAvailable_is_true_when_helper_exists_and_runtime_probe_succeeds_on_windows()
    {
        if (!OperatingSystem.IsWindows()) return;

        var helper = Path.GetTempFileName();
        try
        {
            var launcher = CreateLauncher(helper, _ => true);

            Assert.True(launcher.IsAvailable);
        }
        finally
        {
            File.Delete(helper);
        }
    }

    private static ProcessPortalWindowLauncher CreateLauncher(string helperPath, Func<string, bool> runtimeProbe)
    {
        var constructor = RuntimeProbeConstructor();
        Assert.NotNull(constructor);
        return (ProcessPortalWindowLauncher)constructor.Invoke([helperPath, runtimeProbe]);
    }

    private static ConstructorInfo? RuntimeProbeConstructor() =>
        typeof(ProcessPortalWindowLauncher).GetConstructor(
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            types: [typeof(string), typeof(Func<string, bool>)],
            modifiers: null);
}
