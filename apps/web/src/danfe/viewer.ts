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
  print(): void;
}>;

export function createDanfeViewer(deps: DanfeViewerDependencies): DanfeViewer {
  const { elements } = deps;
  let detachZoom: (() => void) | null = null;

  const onCloseClick = () => close();
  const onPrintClick = () => print();
  const onBackdropClick = (event: Event) => {
    if (event.target === elements.viewer) close();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !elements.viewer.hidden) close();
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
