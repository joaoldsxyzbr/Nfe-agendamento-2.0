function initializeAccessKeyUi(): void {
  const keyHint = document.querySelector<HTMLElement>('.key-hint');
  if (keyHint) {
    keyHint.textContent = '44 caracteres';
  }

  const accessKeyInput = document.querySelector<HTMLInputElement>('#access-key');
  if (accessKeyInput) {
    accessKeyInput.inputMode = 'text';
    accessKeyInput.autocapitalize = 'characters';
    accessKeyInput.spellcheck = false;
  }

  const batchKeysInput = document.querySelector<HTMLTextAreaElement>('#batch-keys');
  if (batchKeysInput) {
    batchKeysInput.placeholder = 'Cole as chaves, uma por linha';
    batchKeysInput.autocapitalize = 'characters';
  }
}

window.addEventListener('DOMContentLoaded', initializeAccessKeyUi, { once: true });
