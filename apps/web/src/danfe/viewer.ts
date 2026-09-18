import type { ParsedNfe } from '../nfe/xml';

export type DanfeViewer = Readonly<{
  open(parsed: ParsedNfe): void;
  openMany(parsed: readonly ParsedNfe[], title: string): void;
  close(): void;
  print(): void;
  dispose(): void;
}>;

type DanfeViewerElements = Readonly<{
  viewer: HTMLElement;
  title: HTMLElement;
  content: HTMLElement;
  closeButton: HTMLButtonElement;
  printButton: HTMLButtonElement;
}>;

export type DanfeViewerDependencies = Readonly<{
  elements: DanfeViewerElements;
  render(parsed: ParsedNfe): HTMLElement;
  attachZoom(container: HTMLElement): () => void;
  bodyClassList: Pick<DOMTokenList, 'add' | 'remove'>;
  addDocumentKeydownListener(listener: (event: KeyboardEvent) => void): void;
  removeDocumentKeydownListener?: (listener: (event: KeyboardEvent) => void) => void;
  getActiveElement(): Element | null;
  print(): void;
}>;

export function createDanfeViewer(deps: DanfeViewerDependencies): DanfeViewer {
  const { elements } = deps;
  let detachZoom: (() => void) | null = null;
  let previousFocus: HTMLElement | null = null;

  const onCloseClick = () => close();
  const onPrintClick = () => print();
  const onBackdropClick = (event: Event) => {
    if (event.target === elements.viewer) close();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (elements.viewer.hidden) return;

    if (event.key === 'Escape') {
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(elements.viewer.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([hidden]), a[href]:not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])',
    ));
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = deps.getActiveElement();

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
      return;
    }

    if (!active || !focusable.includes(active as HTMLElement)) {
      event.preventDefault();
      first.focus();
    }
  };

  elements.closeButton.addEventListener('click', onCloseClick);
  elements.printButton.addEventListener('click', onPrintClick);
  elements.viewer.addEventListener('click', onBackdropClick);
  deps.addDocumentKeydownListener(onKeydown);

  function open(parsed: ParsedNfe): void {
    openMany(
      [parsed],
      `Visualizar DANFE · NF-e ${parsed.number || parsed.accessKey}`,
    );
  }

  function openMany(parsed: readonly ParsedNfe[], title: string): void {
    if (elements.viewer.hidden) {
      const active = deps.getActiveElement();
      previousFocus = isFocusableElement(active) ? active : null;
    }

    detachZoom?.();
    detachZoom = null;

    elements.content.replaceChildren(...parsed.map((item) => deps.render(item)));
    elements.title.textContent = title;
    elements.viewer.hidden = false;
    deps.bodyClassList.add('danfe-open');
    detachZoom = deps.attachZoom(elements.viewer);
    elements.closeButton.focus();
  }

  function close(): void {
    if (elements.viewer.hidden) return;

    elements.viewer.hidden = true;
    deps.bodyClassList.remove('danfe-open');
    detachZoom?.();
    detachZoom = null;
    elements.content.replaceChildren();

    const restoreFocus = previousFocus;
    previousFocus = null;
    restoreFocus?.focus();
  }

  function print(): void {
    deps.print();
  }

  function dispose(): void {
    close();
    elements.closeButton.removeEventListener('click', onCloseClick);
    elements.printButton.removeEventListener('click', onPrintClick);
    elements.viewer.removeEventListener('click', onBackdropClick);
    deps.removeDocumentKeydownListener?.(onKeydown);
  }

  return {
    open,
    openMany,
    close,
    print,
    dispose,
  };
}


function isFocusableElement(value: Element | null): value is HTMLElement {
  return value !== null && typeof (value as { focus?: unknown }).focus === 'function';
}
