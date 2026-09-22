import {
  clearFiscalIdentity,
  loadFiscalIdentity,
  saveFiscalIdentity,
} from './fiscal-store';
import {
  analyzeSupplierConfig,
  clearSupplierConfig,
  saveSupplierConfig,
} from './supplier-store';

const fiscalCnpjInput = requireElement<HTMLInputElement>('#fiscal-cnpj');
const fiscalSaveButton = requireElement<HTMLButtonElement>('#fiscal-cnpj-save');
const fiscalClearButton = requireElement<HTMLButtonElement>('#fiscal-cnpj-clear');
const fiscalStatus = requireElement<HTMLElement>('#fiscal-cnpj-status');
const fileInput = requireElement<HTMLInputElement>('#supplier-config-file');
const clearButton = requireElement<HTMLButtonElement>('#supplier-config-clear');
const status = requireElement<HTMLElement>('#supplier-config-status');

void refreshFiscalIdentity();

fiscalSaveButton.addEventListener('click', () => void saveFiscalCnpj());
fiscalClearButton.addEventListener('click', () => void clearFiscalCnpj());
fileInput.addEventListener('change', () => void importSelectedFile());
clearButton.addEventListener('click', () => void clearLocalConfig());

async function refreshFiscalIdentity(): Promise<void> {
  const identity = await loadFiscalIdentity();
  fiscalCnpjInput.value = identity?.cnpj ?? '';
  fiscalStatus.textContent = identity
    ? 'CNPJ configurado localmente. A consulta direta será tentada antes do Portal.'
    : 'CNPJ ainda não configurado. Sem ele, a consulta direta não pode ser iniciada.';
}

async function saveFiscalCnpj(): Promise<void> {
  try {
    const identity = await saveFiscalIdentity(fiscalCnpjInput.value);
    fiscalCnpjInput.value = identity.cnpj;
    fiscalStatus.textContent = 'CNPJ salvo localmente. A consulta direta SEFAZ está habilitada.';
  } catch (error) {
    fiscalStatus.textContent = error instanceof Error ? error.message : 'Não foi possível salvar o CNPJ.';
  }
}

async function clearFiscalCnpj(): Promise<void> {
  try {
    await clearFiscalIdentity();
    fiscalCnpjInput.value = '';
    fiscalStatus.textContent = 'CNPJ removido. A consulta direta ficará desabilitada até nova configuração.';
  } catch {
    fiscalStatus.textContent = 'Não foi possível limpar o CNPJ local.';
  }
}

async function importSelectedFile(): Promise<void> {
  const file = fileInput.files?.item(0) ?? null;
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    const analysis = analyzeSupplierConfig(parsed);
    await saveSupplierConfig(analysis.config);
    const legacy = analysis.usedLegacyCasing
      ? ' Formato legado de maiúsculas/minúsculas detectado e normalizado.'
      : '';
    status.textContent = [
      'Configuração salva neste navegador.',
      'Fornecedores: ' + analysis.supplierCount + '.',
      'Identificadores: ' + analysis.taxIdCount + '.',
      legacy,
    ].join(' ').replace(/\s+/g, ' ').trim();
  } catch (error) {
    status.textContent = error instanceof Error
      ? 'Configuração não salva: ' + error.message + ' Nenhuma configuração anterior foi alterada.'
      : 'Configuração não salva: arquivo inválido. Nenhuma configuração anterior foi alterada.';
  } finally {
    fileInput.value = '';
  }
}

async function clearLocalConfig(): Promise<void> {
  try {
    await clearSupplierConfig();
    status.textContent = 'Configuração local removida.';
  } catch {
    status.textContent = 'Não foi possível limpar a configuração local.';
  }
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('Elemento ' + selector + ' ausente na página de opções.');
  return element;
}
