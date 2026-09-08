using System.Net.Http.Headers;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using NfeAgendamento.Bridge.Certificates;

namespace NfeAgendamento.Bridge.Fiscal;

public sealed class SefazDistributionTransport : INfeDistributionTransport
{
    private const string Endpoint = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
    private const int MaxResponseBytes = 10 * 1024 * 1024;
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(45);

    private readonly Func<X509Certificate2, HttpMessageHandler> _handlerFactory;

    public SefazDistributionTransport()
        : this(CreateHandler)
    {
    }

    public SefazDistributionTransport(Func<X509Certificate2, HttpMessageHandler> handlerFactory)
    {
        _handlerFactory = handlerFactory ?? throw new ArgumentNullException(nameof(handlerFactory));
    }

    public async Task<TransportResult> LookupAsync(
        string accessKey,
        X509Certificate2 certificate,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(certificate);

        var cnpj = CertificateIdentityReader.ReadCnpj(certificate);
        var soap = NfeDistributionProtocol.BuildSoap(accessKey, cnpj);

        using var handler = _handlerFactory(certificate);
        using var client = new HttpClient(handler, disposeHandler: false)
        {
            Timeout = RequestTimeout,
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint);
        using var content = new StringContent(soap, Encoding.UTF8, "text/xml");
        content.Headers.ContentType = new MediaTypeHeaderValue("text/xml")
        {
            CharSet = "utf-8",
        };
        request.Content = content;

        using var response = await client.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        response.EnsureSuccessStatusCode();

        if (response.Content.Headers.ContentLength is > MaxResponseBytes)
        {
            throw new InvalidDataException("Resposta da SEFAZ excede o limite permitido.");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var limited = new LimitedReadStream(stream, MaxResponseBytes);
        using var reader = new StreamReader(
            limited,
            Encoding.UTF8,
            detectEncodingFromByteOrderMarks: true,
            bufferSize: 8192,
            leaveOpen: false);
        var body = await reader.ReadToEndAsync(cancellationToken);

        return NfeDistributionProtocol.ParseResponse(body, accessKey);
    }

    private static HttpMessageHandler CreateHandler(X509Certificate2 certificate)
    {
        var handler = new HttpClientHandler
        {
            ClientCertificateOptions = ClientCertificateOption.Manual,
        };
        handler.ClientCertificates.Add(certificate);
        return handler;
    }

    private sealed class LimitedReadStream : Stream
    {
        private readonly Stream _inner;
        private readonly long _limit;
        private long _read;

        public LimitedReadStream(Stream inner, long limit)
        {
            _inner = inner ?? throw new ArgumentNullException(nameof(inner));
            _limit = limit;
        }

        public override bool CanRead => _inner.CanRead;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => _read;
        public override long Position
        {
            get => _read;
            set => throw new NotSupportedException();
        }

        public override void Flush() => throw new NotSupportedException();

        public override int Read(byte[] buffer, int offset, int count) =>
            Read(buffer.AsSpan(offset, count));

        public override int Read(Span<byte> buffer)
        {
            var allowed = Allowed(buffer.Length);
            var read = _inner.Read(buffer[..allowed]);
            Track(read);
            return read;
        }

        public override async ValueTask<int> ReadAsync(
            Memory<byte> buffer,
            CancellationToken cancellationToken = default)
        {
            var allowed = Allowed(buffer.Length);
            var read = await _inner.ReadAsync(buffer[..allowed], cancellationToken);
            Track(read);
            return read;
        }

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        private int Allowed(int requested)
        {
            var remainingIncludingOverflowProbe = _limit - _read + 1;
            if (remainingIncludingOverflowProbe <= 0)
            {
                throw new InvalidDataException("Resposta da SEFAZ excede o limite permitido.");
            }

            return (int)Math.Min(requested, remainingIncludingOverflowProbe);
        }

        private void Track(int count)
        {
            _read += count;
            if (_read > _limit)
            {
                throw new InvalidDataException("Resposta da SEFAZ excede o limite permitido.");
            }
        }
    }
}
