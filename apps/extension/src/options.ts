import {
  clearFiscalIdentity,
  loadFiscalIdentity,
  normalizeFiscalCnpj,
  saveFiscalIdentity,
} from './fiscal-config';
import {
  analyzeSupplierConfig,
  clearSupplierConfig,
  saveSupplierConfig,
} from './supplier-store';

const fileInput = requireElement<HTMLInputElement>('#supplier-config-file');
const clearButton = requireElement<HTMLButtonElement>('#supplier-config-clear');
const status = requireElement<HTMLElement>('#supplier-config-status');
const fiscalCnpj = requireElement<HTMLInputElement>('#fiscal-cnpj');
const fiscalSave = requireElement<HTMLButtonElement>('#fiscal-config-save');
const fiscalClear = requireElement<HTMLButtonElement>('#fiscal-config-clear');
const fiscalStatus = requireElement<HTMLElement>('#fiscal-config-status');

void loadFiscalConfig();
fiscalSave.addEventListener('click', () => { void saveFiscalConfig(); });
fiscalClear.addEventListener('click', () => { void clearFiscalConfig(); });

fileInput.addEventListener('change', () => {
  void importSelectedFile();
});

clearButton.addEventListener('click', () => {
  void clearLocalConfig();
});

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
    ].join(' ').replace(/\\s+/g, ' ').trim();
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


async function loadFiscalConfig(): Promise<void> {
  const identity = await loadFiscalIdentity();
  if (!identity) {
    fiscalCnpj.value = '';
    fiscalStatus.textContent = 'CNPJ do A1 ainda não configurado.';
    return;
  }
  fiscalCnpj.value = formatCnpj(identity.cnpj);
  fiscalStatus.textContent = 'CNPJ fiscal configurado neste navegador.';
}

async function saveFiscalConfig(): Promise<void> {
  const normalized = normalizeFiscalCnpj(fiscalCnpj.value);
  if (!normalized) {
    fiscalStatus.textContent = 'CNPJ inválido. Confira os 14 dígitos e os dígitos verificadores.';
    return;
  }
  try {
    await saveFiscalIdentity(normalized);
    fiscalCnpj.value = formatCnpj(normalized);
    fiscalStatus.textContent = 'CNPJ fiscal salvo somente neste navegador.';
  } catch {
    fiscalStatus.textContent = 'Não foi possível salvar o CNPJ fiscal.';
  }
}

async function clearFiscalConfig(): Promise<void> {
  try {
    await clearFiscalIdentity();
    fiscalCnpj.value = '';
    fiscalStatus.textContent = 'CNPJ fiscal removido.';
  } catch {
    fiscalStatus.textContent = 'Não foi possível remover o CNPJ fiscal.';
  }
}

function formatCnpj(value: string): string {
  return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
