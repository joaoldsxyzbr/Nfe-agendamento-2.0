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
    public void Launcher_exposes_platform_probe_test_seam_for_portable_availability_tests()
    {
        var constructor = PortableProbeConstructor();

        Assert.NotNull(constructor);
    }

    [Fact]
    public void IsAvailable_is_false_when_helper_exists_but_runtime_probe_fails()
    {
        var helper = Path.GetTempFileName();
        try
        {
            var launcher = CreateLauncher(helper, _ => false, () => true);

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
        var helper = Path.GetTempFileName();
        try
        {
            var launcher = CreateLauncher(helper, _ => true, () => true);

            Assert.True(launcher.IsAvailable);
        }
        finally
        {
            File.Delete(helper);
        }
    }

    [Fact]
    public void IsAvailable_caches_a_positive_runtime_probe_for_the_launcher_lifetime()
    {
        var helper = Path.GetTempFileName();
        var probes = 0;
        try
        {
            var launcher = CreateLauncher(helper, _ =>
            {
                probes += 1;
                return true;
            }, () => true);

            Assert.True(launcher.IsAvailable);
            Assert.True(launcher.IsAvailable);
            Assert.Equal(1, probes);
        }
        finally
        {
            File.Delete(helper);
        }
    }

    [Fact]
    public void IsAvailable_does_not_cache_a_negative_runtime_probe()
    {
        var helper = Path.GetTempFileName();
        var probes = 0;
        try
        {
            var launcher = CreateLauncher(helper, _ =>
            {
                probes += 1;
                return probes >= 2;
            }, () => true);

            Assert.False(launcher.IsAvailable);
            Assert.True(launcher.IsAvailable);
            Assert.Equal(2, probes);
        }
        finally
        {
            File.Delete(helper);
        }
    }

    private static ProcessPortalWindowLauncher CreateLauncher(
        string helperPath,
        Func<string, bool> runtimeProbe,
        Func<bool> platformProbe)
    {
        var constructor = PortableProbeConstructor();
        Assert.NotNull(constructor);
        return (ProcessPortalWindowLauncher)constructor.Invoke([helperPath, runtimeProbe, platformProbe]);
    }

    private static ConstructorInfo? RuntimeProbeConstructor() =>
        typeof(ProcessPortalWindowLauncher).GetConstructor(
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            types: [typeof(string), typeof(Func<string, bool>)],
            modifiers: null);

    private static ConstructorInfo? PortableProbeConstructor() =>
        typeof(ProcessPortalWindowLauncher).GetConstructor(
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null,
            types: [typeof(string), typeof(Func<string, bool>), typeof(Func<bool>)],
            modifiers: null);
}
