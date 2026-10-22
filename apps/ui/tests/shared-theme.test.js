import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

function createLocalStorageMock() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index) => Array.from(store.keys())[index] ?? null,
  };
}

function createDocumentMock() {
  const attributes = new Map();
  const style = {};
  return {
    documentElement: {
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null,
      removeAttribute: (name) => attributes.delete(name),
      style,
    },
    _attributes: attributes,
    _style: style,
  };
}

describe('theme', () => {
  let localStorageMock;
  let documentMock;
  let originalLocalStorage;
  let originalDocument;
  let themeModule;

  beforeEach(async () => {
    localStorageMock = createLocalStorageMock();
    documentMock = createDocumentMock();
    originalLocalStorage = globalThis.localStorage;
    originalDocument = globalThis.document;
    globalThis.localStorage = localStorageMock;
    globalThis.document = documentMock;

    vi.resetModules();
    themeModule = await import('../src/shared/theme.js');
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
    globalThis.document = originalDocument;
    vi.restoreAllMocks();
  });

  it('define temas válidos', () => {
    expect(themeModule.THEMES.DARK).toBe('dark');
    expect(themeModule.THEMES.LIGHT).toBe('light');
    expect(themeModule.THEMES.SYSTEM).toBe('system');
  });

  it('inicia com tema escuro por padrão', () => {
    const theme = themeModule.initTheme();
    expect(theme).toBe(themeModule.THEMES.DARK);
    expect(documentMock.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('aplica tema claro quando armazenado', () => {
    localStorageMock.setItem('nfe-theme', 'light');
    const theme = themeModule.initTheme();
    expect(theme).toBe(themeModule.THEMES.LIGHT);
    expect(documentMock.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('define e recupera tema', () => {
    themeModule.setTheme(themeModule.THEMES.LIGHT);
    expect(themeModule.getStoredTheme()).toBe(themeModule.THEMES.LIGHT);
    expect(documentMock.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('cicla entre temas', () => {
    themeModule.setTheme(themeModule.THEMES.DARK);
    expect(themeModule.cycleTheme()).toBe(themeModule.THEMES.LIGHT);
    expect(themeModule.cycleTheme()).toBe(themeModule.THEMES.SYSTEM);
    expect(themeModule.cycleTheme()).toBe(themeModule.THEMES.DARK);
  });

  it('rejeita tema inválido', () => {
    expect(() => themeModule.setTheme('invalid')).toThrow('Tema inválido');
  });
});
