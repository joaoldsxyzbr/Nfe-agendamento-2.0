import type { BridgeHealth, PortalOperationStatus } from '../bridge/contracts';

type PortalClient = Readonly<{
  start(accessKey: string, signal?: AbortSignal): Promise<string>;
  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus>;
  cancel(operationId: string): Promise<void>;
}>;

type ExtensionPortalClient = PortalClient & Readonly<{
  isAvailable(signal?: AbortSignal): Promise<boolean>;
}>;

type BridgePortalClient = PortalClient & Readonly<{
  prewarm?(health: BridgeHealth, signal?: AbortSignal): Promise<void>;
}>;

type Owner = 'extension' | 'bridge';

export class PortalRouter {
  private readonly owners = new Map<string, Owner>();

  constructor(
    private readonly extension: ExtensionPortalClient,
    private readonly bridge: BridgePortalClient,
  ) {}

  async prewarm(health: BridgeHealth, signal?: AbortSignal): Promise<void> {
    await Promise.allSettled([
      this.extension.isAvailable(signal),
      this.bridge.prewarm?.(health, signal),
    ]);
  }

  async start(accessKey: string, signal?: AbortSignal): Promise<string> {
    if (await this.extension.isAvailable(signal)) {
      try {
        const operationId = await this.extension.start(accessKey, signal);
        this.owners.set(operationId, 'extension');
        return operationId;
      } catch (error) {
        signal?.throwIfAborted();
        // Nenhuma operação foi criada com sucesso; o helper local continua como rollback.
      }
    }

    const operationId = await this.bridge.start(accessKey, signal);
    this.owners.set(operationId, 'bridge');
    return operationId;
  }

  async waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus> {
    const owner = this.owners.get(operationId);
    if (!owner) throw new Error('Operação do Portal desconhecida.');

    const client = owner === 'extension' ? this.extension : this.bridge;
    try {
      const result = await client.waitForResult(operationId, signal);
      this.owners.delete(operationId);
      return result;
    } catch (error) {
      if (!signal?.aborted) {
        this.owners.delete(operationId);
      }
      throw error;
    }
  }

  async cancel(operationId: string): Promise<void> {
    const owner = this.owners.get(operationId);
    this.owners.delete(operationId);
    if (!owner) return;
    await (owner === 'extension' ? this.extension : this.bridge).cancel(operationId);
  }
}
