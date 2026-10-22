export function createDanfeViewer(deps) {
    const { elements } = deps;
    let detachZoom = null;
    let previousFocus = null;
    const onCloseClick = () => close();
    const onPrintClick = () => print();
    const onBackdropClick = (event) => {
        if (event.target === elements.viewer)
            close();
    };
    const onKeydown = (event) => {
        if (elements.viewer.hidden)
            return;
        if (event.key === 'Escape') {
            close();
            return;
        }
        if (event.key !== 'Tab')
            return;
        const focusable = Array.from(elements.viewer.querySelectorAll('button:not([disabled]):not([hidden]), a[href]:not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])'));
        if (focusable.length === 0)
            return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
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
        if (!active || !focusable.includes(active)) {
            event.preventDefault();
            first.focus();
        }
    };
    elements.closeButton.addEventListener('click', onCloseClick);
    elements.printButton.addEventListener('click', onPrintClick);
    elements.viewer.addEventListener('click', onBackdropClick);
    deps.addDocumentKeydownListener(onKeydown);
    function open(parsed) {
        openMany([parsed], `Visualizar DANFE · NF-e ${parsed.number || parsed.accessKey}`);
    }
    function openMany(parsed, title) {
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
    function close() {
        if (elements.viewer.hidden)
            return;
        elements.viewer.hidden = true;
        deps.bodyClassList.remove('danfe-open');
        detachZoom?.();
        detachZoom = null;
        elements.content.replaceChildren();
        const restoreFocus = previousFocus;
        previousFocus = null;
        restoreFocus?.focus();
    }
    function print() {
        deps.print();
    }
    function dispose() {
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
function isFocusableElement(value) {
    return value !== null && typeof value.focus === 'function';
}
