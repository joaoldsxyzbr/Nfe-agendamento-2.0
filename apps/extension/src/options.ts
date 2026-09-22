import {
  clearSupplierConfig,
  saveSupplierConfig,
  validateSupplierConfig,
} from './supplier-store';

const fileInput = document.querySelector<HTMLInputElement>('#supplier-config-file');
const clearButton = document.querySelector<HTMLButtonElement>('#supplier-config-clear');
const status = document.querySelector<HTMLElement>('#supplier-config-status');

if (!fileInput || !clearButton || !status) {
  throw new Error('A página de opções da extensão está incompleta.');
}

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
    const config = validateSupplierConfig(parsed);
    await saveSupplierConfig(config);
    status.textContent = 'Configuração salva neste navegador.';
  } catch (error) {
    status.textContent = error instanceof Error
      ? `Configuração não salva: ${error.message}`
      : 'Configuração não salva: arquivo inválido.';
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
