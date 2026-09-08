namespace NfeAgendamento.Bridge.Runtime;

public sealed class BridgeSingleInstance : IDisposable
{
    private readonly Mutex _mutex;
    private bool _disposed;

    private BridgeSingleInstance(Mutex mutex) => _mutex = mutex;

    public static bool TryAcquire(string name, out BridgeSingleInstance? instance)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Nome da instância inválido.", nameof(name));

        var mutex = new Mutex(initiallyOwned: true, name, out var createdNew);
        if (!createdNew)
        {
            mutex.Dispose();
            instance = null;
            return false;
        }

        instance = new BridgeSingleInstance(mutex);
        return true;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        try { _mutex.ReleaseMutex(); }
        catch (ApplicationException) { }
        _mutex.Dispose();
    }
}
