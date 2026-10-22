import { describe, expect, it } from 'vitest';
import { createDanfeViewer } from '../src/danfe/viewer';
function parsed(number = '123') {
    return {
        accessKey: '42260812345678000123550010000012341000012342',
        originalXml: '<nfe/>',
        number,
        series: '1',
        issuer: { name: 'Emitente teste', taxId: '12345678000195' },
    };
}
function createHarness() {
    const viewerListeners = new Map();
    const documentListeners = new Map();
    const classNames = new Set();
    const contentChildren = [];
    let zoomAttach = 0;
    let zoomDetach = 0;
    let printCalls = 0;
    let focusCalls = 0;
    let printFocusCalls = 0;
    let previousFocusCalls = 0;
    let activeElement = null;
    const previousFocus = {
        focus: () => {
            previousFocusCalls += 1;
            activeElement = previousFocus;
        },
    };
    activeElement = previousFocus;
    let closeButton;
    let printButton;
    const viewer = {
        hidden: true,
        addEventListener: (type, listener) => {
            viewerListeners.set(type, listener);
        },
        removeEventListener: () => undefined,
        querySelectorAll: () => [closeButton, printButton],
    };
    const title = { textContent: '' };
    const content = {
        replaceChildren: (...children) => {
            contentChildren.splice(0, contentChildren.length, ...children);
        },
    };
    closeButton = {
        disabled: false,
        focus: () => {
            focusCalls += 1;
            activeElement = closeButton;
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    };
    printButton = {
        disabled: false,
        focus: () => {
            printFocusCalls += 1;
            activeElement = printButton;
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    };
    const deps = {
        elements: { viewer, title, content, closeButton, printButton },
        render: (item) => ({ rendered: item.number }),
        attachZoom: () => {
            zoomAttach += 1;
            return () => { zoomDetach += 1; };
        },
        bodyClassList: {
            add: (name) => { classNames.add(name); },
            remove: (name) => { classNames.delete(name); },
        },
        addDocumentKeydownListener: (listener) => {
            documentListeners.set('keydown', listener);
        },
        getActiveElement: () => activeElement,
        print: () => { printCalls += 1; },
    };
    const controller = createDanfeViewer(deps);
    return {
        controller,
        viewer,
        title,
        contentChildren,
        viewerListeners,
        documentListeners,
        classNames,
        get zoomAttach() { return zoomAttach; },
        get zoomDetach() { return zoomDetach; },
        get printCalls() { return printCalls; },
        get focusCalls() { return focusCalls; },
        get printFocusCalls() { return printFocusCalls; },
        get previousFocusCalls() { return previousFocusCalls; },
        setActiveElement: (element) => { activeElement = element; },
        closeButton,
        printButton,
    };
}
describe('DANFE viewer', () => {
    it('opens one document, renders content, attaches zoom and focuses close', () => {
        const h = createHarness();
        h.controller.open(parsed('777'));
        expect(h.viewer.hidden).toBe(false);
        expect(h.title.textContent).toBe('Visualizar DANFE · NF-e 777');
        expect(h.contentChildren).toHaveLength(1);
        expect(h.zoomAttach).toBe(1);
        expect(h.zoomDetach).toBe(0);
        expect(h.classNames.has('danfe-open')).toBe(true);
        expect(h.focusCalls).toBe(1);
    });
    it('reopening replaces content and detaches the previous zoom lifecycle', () => {
        const h = createHarness();
        h.controller.openMany([parsed('1')], 'Primeira');
        h.controller.openMany([parsed('2'), parsed('3')], 'Segunda');
        expect(h.title.textContent).toBe('Segunda');
        expect(h.contentChildren).toHaveLength(2);
        expect(h.zoomAttach).toBe(2);
        expect(h.zoomDetach).toBe(1);
    });
    it('closes, clears content and detaches zoom', () => {
        const h = createHarness();
        h.controller.open(parsed());
        h.controller.close();
        expect(h.viewer.hidden).toBe(true);
        expect(h.contentChildren).toHaveLength(0);
        expect(h.zoomDetach).toBe(1);
        expect(h.classNames.has('danfe-open')).toBe(false);
    });
    it('restores focus to the element that opened the viewer', () => {
        const h = createHarness();
        h.controller.open(parsed());
        h.controller.close();
        expect(h.previousFocusCalls).toBe(1);
    });
    it('traps Tab and Shift+Tab inside the open dialog', () => {
        const h = createHarness();
        const keydown = h.documentListeners.get('keydown');
        expect(keydown).toBeDefined();
        h.controller.open(parsed());
        h.setActiveElement(h.printButton);
        let prevented = 0;
        keydown?.({
            key: 'Tab',
            shiftKey: false,
            preventDefault: () => { prevented += 1; },
        });
        expect(prevented).toBe(1);
        expect(h.focusCalls).toBe(2);
        h.setActiveElement(h.closeButton);
        keydown?.({
            key: 'Tab',
            shiftKey: true,
            preventDefault: () => { prevented += 1; },
        });
        expect(prevented).toBe(2);
        expect(h.printFocusCalls).toBe(1);
    });
    it('handles Escape only while visible', () => {
        const h = createHarness();
        const keydown = h.documentListeners.get('keydown');
        expect(keydown).toBeDefined();
        keydown?.({ key: 'Escape' });
        expect(h.viewer.hidden).toBe(true);
        h.controller.open(parsed());
        keydown?.({ key: 'Escape' });
        expect(h.viewer.hidden).toBe(true);
        expect(h.zoomDetach).toBe(1);
    });
    it('closes on backdrop click but not on clicks inside the modal', () => {
        const h = createHarness();
        const click = h.viewerListeners.get('click');
        expect(click).toBeDefined();
        h.controller.open(parsed());
        click?.({ target: {} });
        expect(h.viewer.hidden).toBe(false);
        click?.({ target: h.viewer });
        expect(h.viewer.hidden).toBe(true);
    });
    it('prints through the injected print action', () => {
        const h = createHarness();
        h.controller.print();
        expect(h.printCalls).toBe(1);
    });
});
