const THEME_STORAGE_KEY = 'nfe-theme';
const THEME_ATTRIBUTE = 'data-theme';

const THEMES = Object.freeze({
  DARK: 'dark',
  LIGHT: 'light',
  SYSTEM: 'system',
});

function getSystemPreference() {
  if (typeof globalThis.matchMedia === 'function') {
    return globalThis.matchMedia('(prefers-color-scheme: light)').matches ? THEMES.LIGHT : THEMES.DARK;
  }
  return THEMES.DARK;
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (!root) return;

  const effective = theme === THEMES.SYSTEM ? getSystemPreference() : theme;
  root.setAttribute(THEME_ATTRIBUTE, effective);
  root.style.colorScheme = effective;
}

export function initTheme() {
  let stored = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // localStorage pode não estar disponível.
  }

  const theme = Object.values(THEMES).includes(stored) ? stored : THEMES.DARK;
  applyTheme(theme);

  if (typeof globalThis.matchMedia === 'function') {
    globalThis.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      const current = getStoredTheme();
      if (current === THEMES.SYSTEM) {
        applyTheme(THEMES.SYSTEM);
      }
    });
  }

  return theme;
}

export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return Object.values(THEMES).includes(stored) ? stored : THEMES.DARK;
  } catch {
    return THEMES.DARK;
  }
}

export function setTheme(theme) {
  if (!Object.values(THEMES).includes(theme)) {
    throw new Error(`Tema inválido: ${theme}`);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignora falha de persistência.
  }
  applyTheme(theme);
}

export function cycleTheme() {
  const current = getStoredTheme();
  const order = [THEMES.DARK, THEMES.LIGHT, THEMES.SYSTEM];
  const next = order[(order.indexOf(current) + 1) % order.length];
  setTheme(next);
  return next;
}

export { THEMES };
