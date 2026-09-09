import { nextDanfeZoom } from './render';

const viewer = document.querySelector<HTMLElement>('#danfe-viewer');
const scroll = viewer?.querySelector<HTMLElement>('.danfe-scroll') ?? null;

if (viewer && scroll) {
  scroll.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || viewer.hidden) return;

    const pages = Array.from(viewer.querySelectorAll<HTMLElement>('.danfe-page'));
    if (!pages.length) return;

    event.preventDefault();
    event.stopPropagation();

    const current = Number.parseFloat(pages[0].style.getPropertyValue('zoom')) || 1;
    const next = nextDanfeZoom(current, event.deltaY);
    if (next === current) return;

    const rect = scroll.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const contentX = scroll.scrollLeft + pointerX;
    const contentY = scroll.scrollTop + pointerY;
    const ratio = next / current;

    for (const page of pages) page.style.setProperty('zoom', String(next));

    scroll.scrollLeft = contentX * ratio - pointerX;
    scroll.scrollTop = contentY * ratio - pointerY;
  }, { passive: false });
}
