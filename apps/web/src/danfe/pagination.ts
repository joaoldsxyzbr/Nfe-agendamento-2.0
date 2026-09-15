/** Reflow using the browser's print metrics, including supplier annotations. */
export function paginateDanfeForPrint(container: HTMLElement): void {
  for (const group of container.querySelectorAll<HTMLElement>('.danfe-pages')) {
    group.classList.add('danfe-measuring');
    const pages = Array.from(group.querySelectorAll<HTMLElement>('.danfe-page'));
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index];
      const body = page.querySelector('tbody');
      const footer = page.querySelector<HTMLElement>('.danfe-footer');
      if (!body || !footer) continue;
      const overflows = () => {
        const bottom = page.getBoundingClientRect().bottom - parseFloat(getComputedStyle(page).paddingBottom);
        return footer.getBoundingClientRect().bottom > bottom - 1;
      };
      while (overflows()) {
        const rows = Array.from(body.querySelectorAll('tr:not(.products-filler)'));
        // An individually oversized row must remain visible; never discard data.
        if (rows.length <= 1) {
          page.classList.add('danfe-oversized');
          break;
        }
        let next = pages[index + 1];
        if (!next) {
          next = page.cloneNode(false) as HTMLElement;
          next.removeAttribute('data-page');
          const header = page.querySelector('.danfe-header')!;
          const table = page.querySelector('.products-table')!;
          next.append(header.cloneNode(true), table.previousElementSibling!.cloneNode(true), table.cloneNode(true), footer.cloneNode(true));
          next.querySelector('tbody')!.replaceChildren();
          group.append(next);
          pages.push(next);
        }
        next.querySelector('tbody')!.prepend(rows[rows.length - 1]);
      }
    }
    pages.forEach((page, index) => {
      page.dataset.page = String(index + 1);
      const label = page.querySelector('.danfe-identity > span:last-child');
      if (label) label.textContent = `Folha ${index + 1}/${pages.length}`;
    });
    group.classList.remove('danfe-measuring');
  }
}
