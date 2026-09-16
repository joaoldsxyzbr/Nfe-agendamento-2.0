function applyUnifiedConsultationUi(): boolean {
  const batchKeysInput = document.querySelector<HTMLTextAreaElement>('#batch-keys');
  const batchHelp = document.querySelector<HTMLElement>('#batch-help');
  const batchStart = document.querySelector<HTMLButtonElement>('#batch-start');
  const batchFooter = document.querySelector<HTMLElement>('.batch-form-footer');
  const modeBatch = document.querySelector<HTMLButtonElement>('#mode-batch');
  const modeControl = document.querySelector<HTMLElement>('.consultation-mode');

  if (!batchKeysInput || !batchHelp || !batchStart || !batchFooter || !modeBatch) {
    return false;
  }

  batchKeysInput.placeholder = 'Cole as chaves, uma por linha';
  batchHelp.textContent = 'As chaves válidas aparecem abaixo antes de consultar. Sem limite fixo de quantidade; as NF-e são processadas uma por vez e o Portal é usado quando a proteção fiscal exigir.';
  batchStart.textContent = 'Consultar';

  // A interface é única: uma chave usa o mesmo fluxo seguro de uma lista com um item.
  modeBatch.click();
  if (modeControl) {
    modeControl.hidden = true;
    modeControl.style.display = 'none';
  }

  if (!batchFooter.querySelector('.batch-actions')) {
    const actions = document.createElement('div');
    actions.className = 'lookup-actions batch-actions';
    actions.setAttribute('aria-label', 'Ações da consulta');

    const reset = document.createElement('button');
    reset.id = 'batch-reset';
    reset.className = 'lookup-reset batch-reset';
    reset.type = 'button';
    reset.textContent = 'Nova consulta';

    reset.addEventListener('click', () => {
      if (batchKeysInput.disabled) return;
      batchKeysInput.value = '';
      batchKeysInput.dispatchEvent(new Event('input', { bubbles: true }));
      batchKeysInput.focus();
    });

    const syncResetState = () => {
      reset.disabled = batchKeysInput.disabled;
    };

    batchKeysInput.addEventListener('input', syncResetState);
    new MutationObserver(syncResetState).observe(batchKeysInput, {
      attributes: true,
      attributeFilter: ['disabled'],
    });

    actions.append(batchStart, reset);
    batchFooter.append(actions);
    batchFooter.style.flexDirection = 'column';
    batchFooter.style.alignItems = 'stretch';
    batchFooter.style.justifyContent = 'flex-start';
    actions.style.justifyContent = 'flex-start';
    syncResetState();
  }

  return true;
}

if (!applyUnifiedConsultationUi()) {
  window.addEventListener('DOMContentLoaded', () => {
    applyUnifiedConsultationUi();
  }, { once: true });
}
