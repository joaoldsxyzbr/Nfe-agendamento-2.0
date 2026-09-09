using System.Buffers.Binary;
using System.Text.Json;

namespace NfeAgendamento.Bridge.Portal;

public static class PortalIpcProtocol
{
    public const int MaxFrameBytes = 11 * 1024 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task WriteAsync(
        Stream stream,
        PortalIpcEnvelope envelope,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(envelope);

        var payload = JsonSerializer.SerializeToUtf8Bytes(envelope, JsonOptions);
        if (payload.Length <= 0 || payload.Length > MaxFrameBytes)
            throw new InvalidDataException("Mensagem IPC do Portal possui tamanho inválido.");

        var prefix = new byte[sizeof(int)];
        BinaryPrimitives.WriteInt32LittleEndian(prefix, payload.Length);

        await stream.WriteAsync(prefix, cancellationToken);
        await stream.WriteAsync(payload, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    public static async Task<PortalIpcEnvelope> ReadAsync(
        Stream stream,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(stream);

        var prefix = new byte[sizeof(int)];
        await ReadExactlyOrThrowAsync(stream, prefix, cancellationToken);

        var length = BinaryPrimitives.ReadInt32LittleEndian(prefix);
        if (length <= 0 || length > MaxFrameBytes)
            throw new InvalidDataException("Mensagem IPC do Portal possui tamanho inválido.");

        var payload = new byte[length];
        await ReadExactlyOrThrowAsync(stream, payload, cancellationToken);

        try
        {
            var envelope = JsonSerializer.Deserialize<PortalIpcEnvelope>(payload, JsonOptions);
            if (envelope is null || string.IsNullOrWhiteSpace(envelope.Type))
                throw new InvalidDataException("Mensagem IPC do Portal inválida.");
            return envelope;
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("Mensagem IPC do Portal contém JSON inválido.", exception);
        }
    }

    private static async Task ReadExactlyOrThrowAsync(
        Stream stream,
        Memory<byte> buffer,
        CancellationToken cancellationToken)
    {
        try
        {
            await stream.ReadExactlyAsync(buffer, cancellationToken);
        }
        catch (EndOfStreamException exception)
        {
            throw new InvalidDataException("Mensagem IPC do Portal foi interrompida antes do fim.", exception);
        }
    }
}
