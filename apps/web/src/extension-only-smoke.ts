import {
  BrowserPortalExtensionClient,
  type PortalExtensionInfo,
} from './portal/extension-client';
import { validateAccessKey } from './nfe/access-key';
import { parseNfeXml, type ParsedNfe } from './nfe/xml';

type ExtensionOnlyClient = Readonly<{
  getInfo(signal?: AbortSignal): Promise<PortalExtensionInfo | null>;
  start(accessKey: string, signal?: AbortSignal): Promise<string>;
  waitForResult(
    operationId: string,
    signal?: AbortSignal,
  ): Promise<Readonly<{
    operationId: string;
    state: 'waiting_for_user' | 'completed' | 'failed' | 'cancelled';
    message: string | null;
    xml: string | null;
  }>>;
  cancel(operationId: string): Promise<void>;
  resolveSupplier(taxId: string): Promise<{ supplierId: string | null }>;
}>;

export async function runExtensionOnlySmoke(
  accessKey: string,
  extension: ExtensionOnlyClient,
): Promise<ParsedNfe> {
  const validation = validateAccessKey(accessKey);
  if (!validation.valid) throw new Error(validation.error);

  const info = await extension.getInfo();
  if (!info) {
    throw new Error('Extensão não conectada. Instale ou habilite a extensão e recarregue esta página.');
  }
  if (!info.capabilities.portalLookup) {
    throw new Error('Atualize a extensão para uma versão com consulta pelo Portal Nacional.');
  }

  const operationId = await extension.start(validation.value);
  const result = await extension.waitForResult(operationId);
  if (result.state !== 'completed' || !result.xml) {
    throw new Error(
      result.message
      ?? (result.state === 'cancelled'
        ? 'Consulta pelo Portal cancelada.'
        : 'O Portal não retornou um XML válido.'),
    );
  }

  const parsed = parseNfeXml(result.xml, validation.value);
  let supplierRuleId: string | null = null;
  try {
    supplierRuleId = (await extension.resolveSupplier(parsed.issuer.taxId)).supplierId;
  } catch {
    supplierRuleId = null;
  }
  return { ...parsed, supplierRuleId };
}

if (typeof document !== 'undefined') mountExtensionOnlySmokePage();

function mountExtensionOnlySmokePage(): void {
  const keyInput = requireElement<HTMLInputElement>('#extension-smoke-key');
  const runButton = requireElement<HTMLButtonElement>('#extension-smoke-run');
  const status = requireElement<HTMLElement>('#extension-smoke-status');
  const extensionState = requireElement<HTMLElement>('#extension-smoke-extension');
  const client = new BrowserPortalExtensionClient();

  const refreshState = () => {
    void refreshExtensionState(client, extensionState, runButton);
  };

  refreshState();
  const stopReadyHint = client.onReadyHint(refreshState);
  window.addEventListener('pagehide', () => stopReadyHint(), { once: true });
  window.addEventListener('focus', refreshState);
  window.addEventListener('pageshow', refreshState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshState();
  });

  runButton.addEventListener('click', () => void runFromPage());

  async function runFromPage(): Promise<void> {
    runButton.disabled = true;
    status.textContent = 'Abrindo Portal Nacional…';
    try {
      const parsed = await runExtensionOnlySmoke(keyInput.value, client);
      status.textContent = [
        'Teste da extensão concluído.',
        parsed.number ? `NF-e ${parsed.number} validada.` : 'XML validado.',
        parsed.supplierRuleId
          ? `Regra local: ${parsed.supplierRuleId}.`
          : 'Nenhuma regra local de fornecedor aplicada.',
      ].join(' ');
    } catch (error) {
      status.textContent = error instanceof Error
        ? error.message
        : 'Não foi possível concluir o teste da extensão.';
    } finally {
      await refreshExtensionState(client, extensionState, runButton);
    }
  }
}

async function refreshExtensionState(
  client: BrowserPortalExtensionClient,
  element: HTMLElement,
  runButton: HTMLButtonElement,
): Promise<void> {
  const info = await client.getInfo();
  if (!info) {
    element.textContent = 'Extensão não conectada';
    runButton.disabled = true;
    return;
  }

  element.textContent = `Extensão conectada · versão ${info.version} · Portal ${info.capabilities.portalLookup ? 'disponível' : 'indisponível'}`;
  runButton.disabled = !info.capabilities.portalLookup;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento ${selector} ausente no gate extension-only.`);
  return element;
}
