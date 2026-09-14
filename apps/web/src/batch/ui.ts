function applyBatchCopy(): boolean {
  const batchKeysInput = document.querySelector<HTMLTextAreaElement>('#batch-keys');
  const batchHelp = document.querySelector<HTMLElement>('#batch-help');

  if (!batchKeysInput || !batchHelp) return false;

  batchKeysInput.placeholder = 'Cole as chaves, uma por linha';
  batchHelp.textContent = 'As chaves válidas aparecem abaixo antes de iniciar. Sem limite fixo de quantidade; o lote processa uma NF-e por vez e usa o Portal quando a proteção fiscal exigir.';
  return true;
}

if (!applyBatchCopy()) {
  window.addEventListener('DOMContentLoaded', () => {
    applyBatchCopy();
  }, { once: true });
}
