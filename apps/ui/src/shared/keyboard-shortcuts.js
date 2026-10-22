const SHORTCUTS = Object.freeze({
  CONSULT: { key: 'Enter', ctrl: true, description: 'Consultar nota' },
  CANCEL: { key: 'Escape', description: 'Cancelar/Fechar' },
  PRINT: { key: 'p', ctrl: true, description: 'Imprimir DANFE' },
  NEW: { key: 'n', ctrl: true, description: 'Nova consulta' },
  ZIP: { key: 'd', ctrl: true, description: 'Baixar ZIP' },
  THEME: { key: 't', ctrl: true, shift: true, description: 'Alternar tema' },
});

function matchesShortcut(event, shortcut) {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    event.ctrlKey === !!shortcut.ctrl &&
    event.shiftKey === !!shortcut.shift &&
    !event.altKey &&
    !event.metaKey
  );
}

export function createKeyboardShortcuts(handlers) {
  const listener = (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      if (matchesShortcut(event, SHORTCUTS.CONSULT)) {
        event.preventDefault();
        handlers.onConsult?.();
        return;
      }
      if (matchesShortcut(event, SHORTCUTS.NEW)) {
        event.preventDefault();
        handlers.onNew?.();
        return;
      }
      return;
    }

    for (const [name, shortcut] of Object.entries(SHORTCUTS)) {
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        const handlerName = `on${name.charAt(0)}${name.slice(1).toLowerCase()}`;
        handlers[handlerName]?.();
        return;
      }
    }
  };

  document.addEventListener('keydown', listener);

  return {
    dispose() {
      document.removeEventListener('keydown', listener);
    },
    shortcuts: SHORTCUTS,
  };
}
