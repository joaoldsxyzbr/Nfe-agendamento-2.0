import { BrowserPortalExtensionClient, } from './portal/extension-client.js';
import { validateAccessKey } from './nfe/access-key.js';
import { parseNfeXml } from './nfe/xml.js';
export async function runExtensionOnlySmoke(accessKey, extension) {
    const validation = validateAccessKey(accessKey);
    if (!validation.valid)
        throw new Error(validation.error);
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
        throw new Error(result.message
            ?? (result.state === 'cancelled'
                ? 'Consulta pelo Portal cancelada.'
                : 'O Portal não retornou um XML válido.'));
    }
    const parsed = parseNfeXml(result.xml, validation.value);
    let supplierRuleId = null;
    try {
        supplierRuleId = (await extension.resolveSupplier(parsed.issuer.taxId)).supplierId;
    }
    catch {
        supplierRuleId = null;
    }
    return { ...parsed, supplierRuleId };
}
if (typeof document !== 'undefined')
    mountExtensionOnlySmokePage();
function mountExtensionOnlySmokePage() {
    const keyInput = requireElement('#extension-smoke-key');
    const runButton = requireElement('#extension-smoke-run');
    const status = requireElement('#extension-smoke-status');
    const extensionState = requireElement('#extension-smoke-extension');
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
        if (document.visibilityState === 'visible')
            refreshState();
    });
    runButton.addEventListener('click', () => void runFromPage());
    async function runFromPage() {
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
        }
        catch (error) {
            status.textContent = error instanceof Error
                ? error.message
                : 'Não foi possível concluir o teste da extensão.';
        }
        finally {
            await refreshExtensionState(client, extensionState, runButton);
        }
    }
}
async function refreshExtensionState(client, element, runButton) {
    const info = await client.getInfo();
    if (!info) {
        element.textContent = 'Extensão não conectada';
        runButton.disabled = true;
        return;
    }
    element.textContent = `Extensão conectada · versão ${info.version} · Portal ${info.capabilities.portalLookup ? 'disponível' : 'indisponível'}`;
    runButton.disabled = !info.capabilities.portalLookup;
}
function requireElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Elemento ${selector} ausente no gate extension-only.`);
    return element;
}
