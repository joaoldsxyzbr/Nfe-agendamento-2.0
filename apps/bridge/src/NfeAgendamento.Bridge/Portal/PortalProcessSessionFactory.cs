using System.Diagnostics;
using System.IO.Pipes;

namespace NfeAgendamento.Bridge.Portal;

public sealed class PortalProcessSessionFactory
{
    public static readonly TimeSpan ReadyTimeout = TimeSpan.FromSeconds(5);

    private readonly string _helperPath;
    private readonly string _workingDirectory;

    public PortalProcessSessionFactory(string helperPath)
    {
        _helperPath = helperPath ?? throw new ArgumentNullException(nameof(helperPath));
        _workingDirectory = Path.GetDirectoryName(helperPath) ?? AppContext.BaseDirectory;
    }

    public async Task<IPortalIpcSession> CreateAsync(CancellationToken cancellationToken)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("O Portal persistente está disponível somente no Windows.");
        if (!File.Exists(_helperPath))
            throw new FileNotFoundException("O helper do Portal não foi encontrado.", _helperPath);

        var pipeName = $"nfe-agendamento-portal-{Environment.ProcessId}-{Guid.NewGuid():N}";
        var process = new Process
        {
            StartInfo = CreateServerStartInfo(_helperPath, pipeName, Environment.ProcessId, _workingDirectory),
            EnableRaisingEvents = true,
        };

        if (!process.Start())
        {
            process.Dispose();
            throw new InvalidOperationException("Não foi possível iniciar o helper persistente do Portal.");
        }

        var pipe = new NamedPipeClientStream(
            ".",
            pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(ReadyTimeout);

            try
            {
                await pipe.ConnectAsync(timeout.Token);
                var ready = await PortalIpcProtocol.ReadAsync(pipe, timeout.Token);
                ValidateReady(ready);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                throw new TimeoutException("O helper do Portal não ficou pronto dentro de 5 segundos.");
            }

            return new NamedPipePortalIpcSession(pipe, process);
        }
        catch
        {
            pipe.Dispose();
            TryTerminate(process);
            process.Dispose();
            throw;
        }
    }

    public static ProcessStartInfo CreateServerStartInfo(
        string helperPath,
        string pipeName,
        int parentProcessId,
        string workingDirectory)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = helperPath,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = workingDirectory,
        };
        startInfo.ArgumentList.Add("--server");
        startInfo.ArgumentList.Add("--pipe-name");
        startInfo.ArgumentList.Add(pipeName);
        startInfo.ArgumentList.Add("--parent-pid");
        startInfo.ArgumentList.Add(parentProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        return startInfo;
    }

    public static void ValidateReady(PortalIpcEnvelope message)
    {
        ArgumentNullException.ThrowIfNull(message);
        if (!string.Equals(message.Type, PortalIpcMessageType.Ready, StringComparison.Ordinal) ||
            !string.IsNullOrWhiteSpace(message.OperationId))
            throw new InvalidDataException("O helper do Portal não confirmou readiness corretamente.");
    }

    private static void TryTerminate(Process process)
    {
        try
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch (Exception exception) when (
            exception is InvalidOperationException or System.ComponentModel.Win32Exception)
        {
        }
    }

    private sealed class NamedPipePortalIpcSession : IPortalIpcSession
    {
        private readonly NamedPipeClientStream _pipe;
        private readonly Process _process;
        private int _disposed;

        public NamedPipePortalIpcSession(NamedPipeClientStream pipe, Process process)
        {
            _pipe = pipe;
            _process = process;
        }

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken) =>
            PortalIpcProtocol.WriteAsync(_pipe, message, cancellationToken);

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) =>
            PortalIpcProtocol.ReadAsync(_pipe, cancellationToken);

        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0) return;

            try
            {
                if (_pipe.IsConnected)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));
                    await PortalIpcProtocol.WriteAsync(
                        _pipe,
                        new PortalIpcEnvelope(PortalIpcMessageType.Shutdown),
                        timeout.Token);
                }
            }
            catch (Exception exception) when (
                exception is IOException
                or InvalidDataException
                or OperationCanceledException
                or ObjectDisposedException)
            {
            }
            finally
            {
                await _pipe.DisposeAsync();
            }

            try
            {
                if (!_process.HasExited)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                    try
                    {
                        await _process.WaitForExitAsync(timeout.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        TryTerminate(_process);
                    }
                }
            }
            finally
            {
                _process.Dispose();
            }
        }
    }
}
