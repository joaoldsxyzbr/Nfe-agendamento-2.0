using System.Buffers.Binary;
using NfeAgendamento.Bridge.Portal;
using Xunit;

namespace NfeAgendamento.Bridge.Tests;

public sealed class PortalIpcProtocolTests
{
    [Fact]
    public async Task Roundtrip_preserves_a_completed_message()
    {
        var expected = new PortalIpcEnvelope(
            PortalIpcMessageType.Completed,
            "op-1",
            "access-key",
            "thumbprint",
            "<nfeProc />",
            "ok");

        await using var stream = new MemoryStream();
        await PortalIpcProtocol.WriteAsync(stream, expected, TestContext.Current.CancellationToken);
        stream.Position = 0;

        var actual = await PortalIpcProtocol.ReadAsync(stream, TestContext.Current.CancellationToken);

        Assert.Equal(expected, actual);
    }

    [Fact]
    public async Task Read_rejects_zero_length_frame()
    {
        await using var stream = new MemoryStream(new byte[4]);

        await Assert.ThrowsAsync<InvalidDataException>(
            () => PortalIpcProtocol.ReadAsync(stream, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Read_rejects_frame_larger_than_11_mib_before_reading_payload()
    {
        var prefix = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(prefix, PortalIpcProtocol.MaxFrameBytes + 1);
        await using var stream = new MemoryStream(prefix);

        await Assert.ThrowsAsync<InvalidDataException>(
            () => PortalIpcProtocol.ReadAsync(stream, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Read_rejects_partial_payload()
    {
        var bytes = new byte[7];
        BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(0, 4), 10);
        bytes[4] = (byte)'{';
        bytes[5] = (byte)'}';
        bytes[6] = (byte)'\n';
        await using var stream = new MemoryStream(bytes);

        await Assert.ThrowsAsync<InvalidDataException>(
            () => PortalIpcProtocol.ReadAsync(stream, TestContext.Current.CancellationToken));
    }
}
