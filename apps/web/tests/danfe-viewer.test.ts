import { describe, expect, it } from 'vitest';
import type { ParsedNfe } from '../src/nfe/xml';
import { createDanfeViewer, type DanfeViewerDependencies } from '../src/danfe/viewer';

function parsed(number = '123'): ParsedNfe {
  return {
    accessKey: '42260812345678000123550010000012341000012342',
    originalXml: '<nfe/>',
    number,
    series: '1',
    issuer: { name: 'Emitente teste', taxId: '12345678000195' },
  } as ParsedNfe;
}

function createHarness() {
  const viewerListeners = new Map<string, (event: Event) => void>();
  const documentListeners = new Map<string, (event: KeyboardEvent) => void>();
  const classNames = new Set<string>();
  const contentChildren: unknown[] = [];
  let zoomAttach = 0;
  let zoomDetach = 0;
  let printCalls = 0;
  let focusCalls = 0;

  const viewer = {
    hidden: true,
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      viewerListeners.set(type, listener as (event: Event) => void);
    },
  } as unknown as HTMLElement;

  const title = { textContent: '' } as HTMLElement;
  const content = {
    replaceChildren: (...children: unknown[]) => {
      contentChildren.splice(0, contentChildren.length, ...children);
    },
  } as unknown as HTMLElement;
  const closeButton = {
    focus: () => { focusCalls += 1; },
    addEventListener: () => undefined,
  } as unknown as HTMLButtonElement;
  const printButton = {
    addEventListener: () => undefined,
  } as unknown as HTMLButtonElement;

  const deps: DanfeViewerDependencies = {
    elements: { viewer, title, content, closeButton, printButton },
    render: (item: ParsedNfe) => ({ rendered: item.number }) as unknown as HTMLElement,
    attachZoom: () => {
      zoomAttach += 1;
      return () => { zoomDetach += 1; };
    },
    bodyClassList: {
      add: (name: string) => { classNames.add(name); },
      remove: (name: string) => { classNames.delete(name); },
    },
    addDocumentKeydownListener: (listener: (event: KeyboardEvent) => void) => {
      documentListeners.set('keydown', listener);
    },
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

  it('handles Escape only while visible', () => {
    const h = createHarness();
    const keydown = h.documentListeners.get('keydown');
    expect(keydown).toBeDefined();

    keydown?.({ key: 'Escape' } as KeyboardEvent);
    expect(h.viewer.hidden).toBe(true);

    h.controller.open(parsed());
    keydown?.({ key: 'Escape' } as KeyboardEvent);
    expect(h.viewer.hidden).toBe(true);
    expect(h.zoomDetach).toBe(1);
  });

  it('closes on backdrop click but not on clicks inside the modal', () => {
    const h = createHarness();
    const click = h.viewerListeners.get('click');
    expect(click).toBeDefined();

    h.controller.open(parsed());
    click?.({ target: {} } as Event);
    expect(h.viewer.hidden).toBe(false);

    click?.({ target: h.viewer } as unknown as Event);
    expect(h.viewer.hidden).toBe(true);
  });

  it('prints through the injected print action', () => {
    const h = createHarness();

    h.controller.print();

    expect(h.printCalls).toBe(1);
  });
});
