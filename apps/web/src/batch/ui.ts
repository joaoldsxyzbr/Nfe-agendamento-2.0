import { parseBatchInput } from './input';

function applyUnifiedConsultationUi(): boolean {
  const batchPanel = document.querySelector<HTMLElement>('#batch-consultation-panel');
  const batchForm = document.querySelector<HTMLFormElement>('#batch-form');
  const batchKeysInput = document.querySelector<HTMLTextAreaElement>('#batch-keys');
  const batchHelp = document.querySelector<HTMLElement>('#batch-help');
  const batchStart = document.querySelector<HTMLButtonElement>('#batch-start');
  const batchFooter = document.querySelector<HTMLElement>('.batch-form-footer');
  const modeBatch = document.querySelector<HTMLButtonElement>('#mode-batch');
  const modeControl = document.querySelector<HTMLElement>('.consultation-mode');

  if (!batchPanel || !batchForm || !batchKeysInput || !batchHelp || !batchStart || !batchFooter || !modeBatch) {
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

  const getValidKeyCount = () => parseBatchInput(batchKeysInput.value).validKeys.length;

  const syncCompactMode = () => {
    batchPanel.classList.toggle('is-compact-single', getValidKeyCount() <= 1);
  };

  batchKeysInput.addEventListener('input', syncCompactMode);
  syncCompactMode();

  if (!batchFooter.querySelector('.batch-actions')) {
    const actions = document.createElement('div');
    actions.className = 'lookup-actions batch-actions';
    actions.setAttribute('aria-label', 'Ações da consulta');

    const reset = document.createElement('button');
    reset.id = 'batch-reset';
    reset.className = 'lookup-reset batch-reset';
    reset.type = 'button';
    reset.textContent = 'Nova consulta';
    reset.hidden = true;

    let singleConsultationPending = false;
    let singleConsultationCompleted = false;

    const syncActionVisibility = () => {
      const validKeyCount = getValidKeyCount();

      if (validKeyCount > 1) {
        batchStart.hidden = false;
        reset.hidden = false;
        return;
      }

      batchStart.hidden = singleConsultationCompleted;
      reset.hidden = !singleConsultationCompleted;
    };

    reset.addEventListener('click', () => {
      if (batchKeysInput.disabled) return;
      singleConsultationPending = false;
      singleConsultationCompleted = false;
      batchKeysInput.value = '';
      batchKeysInput.dispatchEvent(new Event('input', { bubbles: true }));
      batchKeysInput.focus();
    });

    // Captura antes do listener principal: registra que uma consulta unitária realmente começou.
    batchForm.addEventListener('submit', () => {
      if (getValidKeyCount() === 1 && !batchStart.disabled) {
        singleConsultationPending = true;
        singleConsultationCompleted = false;
        syncActionVisibility();
      }
    }, { capture: true });

    const syncActionState = () => {
      reset.disabled = batchKeysInput.disabled;

      if (singleConsultationPending && !batchKeysInput.disabled) {
        singleConsultationPending = false;
        singleConsultationCompleted = true;
      }

      syncActionVisibility();
    };

    batchKeysInput.addEventListener('input', () => {
      if (!batchKeysInput.disabled) {
        singleConsultationPending = false;
        singleConsultationCompleted = false;
      }
      syncCompactMode();
      syncActionState();
    });

    new MutationObserver(syncActionState).observe(batchKeysInput, {
      attributes: true,
      attributeFilter: ['disabled'],
    });

    actions.append(batchStart, reset);
    batchFooter.append(actions);
    batchFooter.style.flexDirection = 'column';
    batchFooter.style.alignItems = 'stretch';
    batchFooter.style.justifyContent = 'flex-start';
    actions.style.justifyContent = 'flex-start';
    syncActionState();
  }

  return true;
}

if (!applyUnifiedConsultationUi()) {
  window.addEventListener('DOMContentLoaded', () => {
    applyUnifiedConsultationUi();
  }, { once: true });
}
