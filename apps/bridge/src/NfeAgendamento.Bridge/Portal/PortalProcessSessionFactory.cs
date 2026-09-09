using System.Diagnostics;
using System.IO.Pipes;

namespace NfeAgendamento.Bridge.Portal;

public sealed class PortalProcessSessionFactory : IAsyncDisposable
{
    public static readonly TimeSpan ReadyTimeout = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan ShutdownTimeout = TimeSpan.FromSeconds(1);

    private readonly string _helperPath;
    private readonly string _workingDirectory;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private Process? _process;
    private string? _pipeName;
    private int _disposed;

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

        Process process;
        string pipeName;
        await _gate.WaitAsync(cancellationToken);
        try
        {
            ThrowIfDisposed();
            (process, pipeName) = EnsureHelperLocked();
        }
        finally
        {
            _gate.Release();
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

            return new NamedPipePortalIpcSession(pipe);
        }
        catch
        {
            pipe.Dispose();
            await InvalidateHelperAsync(process);
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0)
            return;

        Process? process;
        string? pipeName;
        await _gate.WaitAsync();
        try
        {
            process = _process;
            pipeName = _pipeName;
            _process = null;
            _pipeName = null;
        }
        finally
        {
            _gate.Release();
        }

        if (process is not null)
        {
            if (!process.HasExited && !string.IsNullOrWhiteSpace(pipeName))
                await TryRequestShutdownAsync(pipeName);

            await WaitForExitOrTerminateAsync(process);
            process.Dispose();
        }

        _gate.Dispose();
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

    private (Process Process, string PipeName) EnsureHelperLocked()
    {
        if (_process is not null)
        {
            if (!_process.HasExited && !string.IsNullOrWhiteSpace(_pipeName))
                return (_process, _pipeName);

            _process.Dispose();
            _process = null;
            _pipeName = null;
        }

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

        _process = process;
        _pipeName = pipeName;
        return (process, pipeName);
    }

    private async Task InvalidateHelperAsync(Process process)
    {
        await _gate.WaitAsync();
        try
        {
            if (!ReferenceEquals(_process, process))
                return;

            _process = null;
            _pipeName = null;
        }
        finally
        {
            _gate.Release();
        }

        TryTerminate(process);
        process.Dispose();
    }

    private async Task TryRequestShutdownAsync(string pipeName)
    {
        using var timeout = new CancellationTokenSource(ShutdownTimeout);
        await using var pipe = new NamedPipeClientStream(
            ".",
            pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous);

        try
        {
            await pipe.ConnectAsync(timeout.Token);
            ValidateReady(await PortalIpcProtocol.ReadAsync(pipe, timeout.Token));
            await PortalIpcProtocol.WriteAsync(
                pipe,
                new PortalIpcEnvelope(PortalIpcMessageType.Shutdown),
                timeout.Token);
        }
        catch (Exception exception) when (
            exception is IOException
            or InvalidDataException
            or OperationCanceledException
            or ObjectDisposedException)
        {
        }
    }

    private static async Task WaitForExitOrTerminateAsync(Process process)
    {
        try
        {
            if (process.HasExited)
                return;

            using var timeout = new CancellationTokenSource(ShutdownTimeout);
            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException)
            {
                TryTerminate(process);
            }
        }
        catch (InvalidOperationException)
        {
        }
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

    private void ThrowIfDisposed()
    {
        if (Volatile.Read(ref _disposed) != 0)
            throw new ObjectDisposedException(nameof(PortalProcessSessionFactory));
    }

    private sealed class NamedPipePortalIpcSession : IPortalIpcSession
    {
        private readonly NamedPipeClientStream _pipe;
        private int _disposed;

        public NamedPipePortalIpcSession(NamedPipeClientStream pipe) => _pipe = pipe;

        public Task SendAsync(PortalIpcEnvelope message, CancellationToken cancellationToken) =>
            PortalIpcProtocol.WriteAsync(_pipe, message, cancellationToken);

        public Task<PortalIpcEnvelope> ReceiveAsync(CancellationToken cancellationToken) =>
            PortalIpcProtocol.ReadAsync(_pipe, cancellationToken);

        public async ValueTask DisposeAsync()
        {
            if (Interlocked.Exchange(ref _disposed, 1) != 0)
                return;
            await _pipe.DisposeAsync();
        }
    }
}
