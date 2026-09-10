import './consultation-actions.css';

function positionConsultationActions(): void {
  const form = document.querySelector<HTMLFormElement>('#lookup-form');
  const lookupRow = form?.querySelector<HTMLElement>('.lookup-row');
  const submit = form?.querySelector<HTMLButtonElement>('#lookup-submit');
  const reset = document.querySelector<HTMLButtonElement>('#lookup-reset');

  if (!form || !lookupRow || !submit || !reset || form.querySelector('.lookup-actions')) {
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'lookup-actions';
  actions.setAttribute('aria-label', 'Ações da consulta');

  lookupRow.insertAdjacentElement('afterend', actions);
  actions.append(reset, submit);

  const legacyToolbar = document.querySelector<HTMLElement>('.result-toolbar');
  if (legacyToolbar && legacyToolbar.childElementCount === 0) {
    legacyToolbar.remove();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', positionConsultationActions, { once: true });
} else {
  positionConsultationActions();
}
