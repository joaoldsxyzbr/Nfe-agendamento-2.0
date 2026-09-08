using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalFallbackServiceTests
{
    private const string AccessKey = "42260812345678000123550010000012341000012342";

    [Fact]
    public async Task Completed_operation_returns_only_validated_xml_for_its_key()
    {
        var xml = ValidXml(AccessKey);
        var launcher = new FakeLauncher(_ => Task.FromResult(PortalLaunchResult.Completed(xml)));
        var service = new PortalFallbackService(launcher, () => "ABC123");

        var operationId = await service.StartAsync(AccessKey);
        var status = await WaitForTerminalAsync(service, operationId);

        Assert.Equal(PortalOperationStates.Completed, status.State);
        Assert.Equal(xml, status.Xml);
        Assert.Null(service.GetStatus("unknown-operation"));
        Assert.Single(launcher.Requests);
        Assert.Equal(AccessKey, launcher.Requests[0].AccessKey);
        Assert.Equal("ABC123", launcher.Requests[0].CertificateThumbprint);
    }

    [Fact]
    public async Task Mismatched_xml_fails_the_operation_and_never_exposes_xml()
    {
        var wrongKey = "42260812345678000123550010000012341000012359";
        var launcher = new FakeLauncher(_ => Task.FromResult(PortalLaunchResult.Completed(ValidXml(wrongKey))));
        var service = new PortalFallbackService(launcher, () => "ABC123");

        var operationId = await service.StartAsync(AccessKey);
        var status = await WaitForTerminalAsync(service, operationId);

        Assert.Equal(PortalOperationStates.Failed, status.State);
        Assert.Null(status.Xml);
        Assert.Contains("não corresponde", status.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Empty_or_oversized_xml_is_rejected()
    {
        Assert.Throws<InvalidDataException>(() => NfePortalXmlValidator.Validate("", AccessKey));

        var huge = "<nfeProc>" + new string('A', NfePortalXmlValidator.MaxXmlBytes + 1) + "</nfeProc>";
        Assert.Throws<InvalidDataException>(() => NfePortalXmlValidator.Validate(huge, AccessKey));
        await Task.CompletedTask;
    }

    [Fact]
    public async Task Portal_cannot_start_without_selected_certificate_or_available_launcher()
    {
        var available = new FakeLauncher(_ => Task.FromResult(PortalLaunchResult.Cancelled("cancelled")));
        var noCertificate = new PortalFallbackService(available, () => null);
        await Assert.ThrowsAsync<InvalidOperationException>(() => noCertificate.StartAsync(AccessKey));

        var unavailable = new FakeLauncher(_ => Task.FromResult(PortalLaunchResult.Cancelled("cancelled"))) { IsAvailable = false };
        var service = new PortalFallbackService(unavailable, () => "ABC123");
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.StartAsync(AccessKey));
    }

    [Fact]
    public async Task Cancelled_operation_is_terminal_without_xml()
    {
        var launcher = new FakeLauncher(_ => Task.FromResult(PortalLaunchResult.Cancelled("Portal fechado pelo usuário.")));
        var service = new PortalFallbackService(launcher, () => "ABC123");

        var operationId = await service.StartAsync(AccessKey);
        var status = await WaitForTerminalAsync(service, operationId);

        Assert.Equal(PortalOperationStates.Cancelled, status.State);
        Assert.Null(status.Xml);
    }

    private static async Task<PortalOperationStatus> WaitForTerminalAsync(PortalFallbackService service, string operationId)
    {
        for (var attempt = 0; attempt < 50; attempt++)
        {
            var status = service.GetStatus(operationId) ?? throw new Xunit.Sdk.XunitException("Operation not found.");
            if (status.State is PortalOperationStates.Completed or PortalOperationStates.Failed or PortalOperationStates.Cancelled)
                return status;
            await Task.Delay(10);
        }
        throw new Xunit.Sdk.XunitException("Portal operation did not complete.");
    }

    private static string ValidXml(string accessKey) =>
        $"<nfeProc xmlns=\"http://www.portalfiscal.inf.br/nfe\"><NFe><infNFe Id=\"NFe{accessKey}\" /></NFe></nfeProc>";

    private sealed class FakeLauncher(Func<PortalLaunchRequest, Task<PortalLaunchResult>> handler) : IPortalWindowLauncher
    {
        public bool IsAvailable { get; set; } = true;
        public List<PortalLaunchRequest> Requests { get; } = [];

        public async Task<PortalLaunchResult> OpenAsync(PortalLaunchRequest request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return await handler(request);
        }
    }
}
