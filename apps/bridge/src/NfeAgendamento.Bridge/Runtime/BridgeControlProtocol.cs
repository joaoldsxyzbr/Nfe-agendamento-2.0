using System.Buffers.Binary;
using System.Text.Json;

namespace NfeAgendamento.Bridge.Runtime;

public static class BridgeControlProtocol
{
    public const int ProtocolVersion = 1;
    public const int MaxFrameBytes = 16 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static Task WriteAsync(
        Stream stream,
        BridgeControlRequest request,
        CancellationToken cancellationToken = default) =>
        WriteFrameAsync(stream, request, cancellationToken);

    public static Task WriteResponseAsync(
        Stream stream,
        BridgeControlResponse response,
        CancellationToken cancellationToken = default) =>
        WriteFrameAsync(stream, response, cancellationToken);

    public static async Task<BridgeControlRequest> ReadRequestAsync(
        Stream stream,
        CancellationToken cancellationToken = default)
    {
        var request = await ReadFrameAsync<BridgeControlRequest>(stream, cancellationToken);
        if (request.ProtocolVersion != ProtocolVersion || string.IsNullOrWhiteSpace(request.Type))
            throw new InvalidDataException("Mensagem de controle do Bridge inválida.");
        return request;
    }

    public static async Task<BridgeControlResponse> ReadResponseAsync(
        Stream stream,
        CancellationToken cancellationToken = default)
    {
        var response = await ReadFrameAsync<BridgeControlResponse>(stream, cancellationToken);
        if (response.ProtocolVersion != ProtocolVersion)
            throw new InvalidDataException("Resposta de controle do Bridge usa versão incompatível.");
        return response;
    }

    private static async Task WriteFrameAsync<T>(
        Stream stream,
        T message,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);
        ArgumentNullException.ThrowIfNull(message);

        var payload = JsonSerializer.SerializeToUtf8Bytes(message, JsonOptions);
        if (payload.Length <= 0 || payload.Length > MaxFrameBytes)
            throw new InvalidDataException("Mensagem de controle do Bridge possui tamanho inválido.");

        var prefix = new byte[sizeof(int)];
        BinaryPrimitives.WriteInt32LittleEndian(prefix, payload.Length);
        await stream.WriteAsync(prefix, cancellationToken);
        await stream.WriteAsync(payload, cancellationToken);
        await stream.FlushAsync(cancellationToken);
    }

    private static async Task<T> ReadFrameAsync<T>(
        Stream stream,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(stream);

        var prefix = new byte[sizeof(int)];
        await ReadExactlyOrThrowAsync(stream, prefix, cancellationToken);
        var length = BinaryPrimitives.ReadInt32LittleEndian(prefix);
        if (length <= 0 || length > MaxFrameBytes)
            throw new InvalidDataException("Mensagem de controle do Bridge possui tamanho inválido.");

        var payload = new byte[length];
        await ReadExactlyOrThrowAsync(stream, payload, cancellationToken);

        try
        {
            return JsonSerializer.Deserialize<T>(payload, JsonOptions)
                ?? throw new InvalidDataException("Mensagem de controle do Bridge inválida.");
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("Mensagem de controle do Bridge contém JSON inválido.", exception);
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
            throw new InvalidDataException("Mensagem de controle do Bridge foi interrompida antes do fim.", exception);
        }
    }
}
