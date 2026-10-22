import { vi } from 'vitest';
function createEvent() {
    const listeners = [];
    return {
        listeners,
        addListener: vi.fn((listener) => {
            listeners.push(listener);
        }),
    };
}
export function createFakeChrome(options = {}) {
    const runtimeMessage = createEvent();
    const runtimeInstalled = createEvent();
    const runtimeStartup = createEvent();
    const actionClicked = createEvent();
    const storageChanged = createEvent();
    const windowRemoved = createEvent();
    const tabRemoved = createEvent();
    const beforeRequest = createEvent();
    const sessionState = new Map(Object.entries(options.sessionState ?? {}));
    const localState = new Map();
    const windows = new Map();
    const tabs = new Map();
    const sentSiteEvents = [];
    const createdWindows = [];
    const removedWindows = [];
    const scriptExecutions = [];
    const executeScriptResults = [...(options.executeScriptResults ?? [])];
    const windowRemovalWaiters = new Map();
    let nextWindowId = 100;
    let nextTabId = 1_000;
    for (const window of options.windows ?? []) {
        if (!Number.isInteger(window.id))
            continue;
        windows.set(window.id, { ...window });
        nextWindowId = Math.max(nextWindowId, window.id + 1);
    }
    for (const tab of options.tabs ?? []) {
        if (!Number.isInteger(tab.id))
            continue;
        tabs.set(tab.id, { ...tab });
        nextTabId = Math.max(nextTabId, tab.id + 1);
    }
    const session = {
        get: vi.fn(async (key) => (sessionState.has(key) ? { [key]: sessionState.get(key) } : {})),
        set: vi.fn(async (values) => {
            for (const [key, value] of Object.entries(values))
                sessionState.set(key, value);
        }),
        remove: vi.fn(async (key) => {
            sessionState.delete(key);
        }),
    };
    const local = {
        setAccessLevel: vi.fn(async () => undefined),
        get: vi.fn(async (key) => (localState.has(key) ? { [key]: localState.get(key) } : {})),
        set: vi.fn(async (values) => {
            for (const [key, value] of Object.entries(values))
                localState.set(key, value);
        }),
        remove: vi.fn(async (key) => {
            localState.delete(key);
        }),
    };
    const chrome = {
        runtime: {
            id: 'test-extension-id',
            getURL: vi.fn((path) => `chrome-extension://test-extension-id/${path}`),
            sendMessage: vi.fn(async (message) => {
                if (message?.source === 'background')
                    sentSiteEvents.push({ tabId: message.siteTabId, message: { source: message.source, event: message.event } });
                return undefined;
            }),
            onMessage: runtimeMessage,
            onInstalled: runtimeInstalled,
            onStartup: runtimeStartup,
            getManifest: vi.fn(() => ({ version: '0.2.12' })),
            openOptionsPage: vi.fn(async () => undefined),
        },
        action: {
            onClicked: actionClicked,
        },
        storage: {
            local,
            session,
            onChanged: storageChanged,
        },
        windows: {
            onRemoved: windowRemoved,
            getLastFocused: vi.fn(async () => options.lastFocusedWindow ?? {
                id: 1, type: 'normal', left: 0, top: 0, width: 1600, height: 900,
            }),
            create: vi.fn(async (options) => {
                const id = nextWindowId++;
                const tabId = nextTabId++;
                const record = { id, ...options };
                windows.set(id, record);
                tabs.set(tabId, {
                    id: tabId,
                    windowId: id,
                    url: typeof options.url === 'string' ? options.url : 'about:blank',
                });
                createdWindows.push(record);
                return record;
            }),
            update: vi.fn(async (windowId, changes) => {
                const window = windows.get(windowId);
                if (!window) throw new Error('Window not found.');
                Object.assign(window, changes);
                return window;
            }),
            get: vi.fn(async (windowId) => {
                const window = windows.get(windowId);
                if (!window)
                    throw new Error('Window not found.');
                return window;
            }),
            remove: vi.fn(async (windowId) => {
                if (!windows.has(windowId))
                    throw new Error('Window not found.');
                windows.delete(windowId);
                for (const [tabId, tab] of tabs) {
                    if (tab.windowId === windowId)
                        tabs.delete(tabId);
                }
                removedWindows.push(windowId);
                for (const resolve of windowRemovalWaiters.get(windowId) ?? [])
                    resolve();
                windowRemovalWaiters.delete(windowId);
            }),
        },
        tabs: {
            onRemoved: tabRemoved,
            create: vi.fn(async ({ url }) => {
                const id = nextTabId++;
                const tab = { id, windowId: 1, url };
                tabs.set(id, tab);
                return tab;
            }),
            query: vi.fn(async (query) => {
                if (Number.isInteger(query.windowId)) {
                    return [...tabs.values()].filter((tab) => tab.windowId === query.windowId);
                }
                if (typeof query.url === 'string') {
                    const prefix = query.url.endsWith('/*') ? query.url.slice(0, -1) : query.url;
                    return [...tabs.values()].filter((tab) => typeof tab.url === 'string' && tab.url.startsWith(prefix));
                }
                return [...tabs.values()];
            }),
            get: vi.fn(async (tabId) => {
                const tab = tabs.get(tabId);
                if (!tab)
                    throw new Error('Tab not found.');
                return tab;
            }),
            update: vi.fn(async (tabId, changes) => {
                const tab = tabs.get(tabId);
                if (!tab)
                    throw new Error('Tab not found.');
                Object.assign(tab, changes);
                return tab;
            }),
            sendMessage: vi.fn(async (tabId, message) => {
                sentSiteEvents.push({ tabId, message });
                return undefined;
            }),
        },
        webRequest: {
            onBeforeRequest: beforeRequest,
        },
        scripting: {
            executeScript: vi.fn(async (input) => {
                scriptExecutions.push(input);
                return executeScriptResults.shift() ?? [];
            }),
        },
    };
    async function flush() {
        for (let index = 0; index < 8; index += 1)
            await Promise.resolve();
    }
    async function emitRuntimeMessage(message, sender) {
        if (Number.isInteger(sender?.tab?.id)) {
            tabs.set(sender.tab.id, {
                id: sender.tab.id,
                windowId: sender.tab.windowId,
                url: sender.tab.url ?? sender.url ?? '',
            });
        }
        const listener = runtimeMessage.listeners[0];
        if (!listener)
            throw new Error('Runtime message listener not registered.');
        return await new Promise((resolve, reject) => {
            let settled = false;
            const sendResponse = (response) => {
                settled = true;
                resolve(response);
            };
            try {
                const result = listener(message, sender, sendResponse);
                if (result !== true && !settled)
                    resolve(result);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    async function emitWindowRemoved(windowId) {
        windows.delete(windowId);
        for (const [tabId, tab] of tabs) {
            if (tab.windowId === windowId)
                tabs.delete(tabId);
        }
        for (const listener of windowRemoved.listeners)
            listener(windowId);
        await flush();
    }
    async function emitTabRemoved(tabId) {
        tabs.delete(tabId);
        for (const listener of tabRemoved.listeners)
            listener(tabId);
        await flush();
    }
    async function emitBeforeRequest(details) {
        for (const listener of beforeRequest.listeners)
            listener(details);
        await flush();
    }
    async function waitForWindowRemoval(windowId) {
        if (removedWindows.includes(windowId))
            return;
        await new Promise((resolve) => {
            const waiters = windowRemovalWaiters.get(windowId) ?? [];
            waiters.push(resolve);
            windowRemovalWaiters.set(windowId, waiters);
        });
    }
    return {
        chrome,
        sentSiteEvents,
        createdWindows,
        removedWindows,
        sessionState,
        scriptExecutions,
        emitRuntimeMessage,
        emitWindowRemoved,
        emitTabRemoved,
        emitBeforeRequest,
        waitForWindowRemoval,
        flush,
    };
}