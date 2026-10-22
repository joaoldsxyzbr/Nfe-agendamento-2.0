/**
 * Ajusta a paginação de impressão sem depender do layout momentâneo do navegador.
 *
 * O evento `beforeprint` pode ocorrer antes de o Chromium aplicar `@media print`.
 * Medir a geometria nesse ponto faz uma página saudável parecer cheia e pode empurrar
 * praticamente um item por folha. Aqui usamos apenas o conteúdo das linhas e limites
 * conservadores em milímetros, deixando a impressão determinística.
 */
const FIRST_PAGE_PRODUCT_SPACE_MM = 110;
const CONTINUATION_PRODUCT_SPACE_MM = 204;
const MIN_FIRST_PAGE_PRODUCT_SPACE_MM = 58;
export function paginateDanfeForPrint(container) {
    for (const group of container.querySelectorAll('.danfe-pages')) {
        const pages = Array.from(group.querySelectorAll('.danfe-page'));
        for (let index = 0; index < pages.length; index += 1) {
            const page = pages[index];
            const body = page.querySelector('tbody');
            if (!body)
                continue;
            const rows = Array.from(body.querySelectorAll('tr:not(.products-filler)'));
            if (rows.length <= 1)
                continue;
            const available = isFirstDanfePage(page)
                ? Math.max(MIN_FIRST_PAGE_PRODUCT_SPACE_MM, FIRST_PAGE_PRODUCT_SPACE_MM
                    - estimateAdditionalPenaltyMm(page)
                    - estimateOptionalFiscalPenaltyMm(page))
                : CONTINUATION_PRODUCT_SPACE_MM;
            let used = 0;
            let splitIndex = rows.length;
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
                const height = estimateRowHeightMm(rows[rowIndex]);
                if (rowIndex > 0 && used + height > available) {
                    splitIndex = rowIndex;
                    break;
                }
                used += height;
            }
            if (splitIndex >= rows.length)
                continue;
            let next = pages[index + 1] ?? null;
            if (!next) {
                next = createContinuationPage(page);
                if (!next)
                    continue;
                group.append(next);
                pages.push(next);
            }
            const nextBody = next.querySelector('tbody');
            if (!nextBody)
                continue;
            insertRowsBeforeExisting(nextBody, rows.slice(splitIndex));
        }
        pages.forEach((page, index) => {
            page.dataset.page = String(index + 1);
            const label = page.querySelector('.danfe-identity > span:last-child');
            if (label)
                label.textContent = `Folha ${index + 1}/${pages.length}`;
        });
    }
}
function isFirstDanfePage(page) {
    return page.querySelector('.receipt-stub') !== null;
}
function estimateRowHeightMm(row) {
    const description = row.querySelector('.description');
    const baseDescription = directText(description);
    const descriptionLines = Math.max(1, Math.ceil(baseDescription.length / 43));
    const packageLines = row.querySelector('.package-detail') ? 1 : 0;
    const taxText = row.querySelector('.tax-detail')?.textContent?.trim() ?? '';
    const taxLines = taxText ? Math.max(1, Math.ceil(taxText.length / 58)) : 0;
    const descriptionBlockLines = descriptionLines + packageLines + taxLines;
    const codeLines = 1 + (row.querySelector('.internal-product-code') ? 1 : 0);
    const quantityLines = 1 + (row.querySelector('.internal-quantity') ? 1 : 0);
    const visualLines = Math.max(descriptionBlockLines, codeLines, quantityLines);
    return 4.1 + Math.max(0, visualLines - 1) * 2.6;
}
function directText(element) {
    if (!element)
        return '';
    return Array.from(element.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent ?? '')
        .join('')
        .trim();
}
function estimateAdditionalPenaltyMm(page) {
    const text = page.querySelector('.additional-grid p')?.textContent?.trim() ?? '';
    if (!text)
        return 0;
    return Math.max(0, Math.ceil(text.length / 145) - 4) * 1.35;
}
function estimateOptionalFiscalPenaltyMm(page) {
    const locations = page.querySelectorAll('.nfe-location-block').length;
    const issqn = page.querySelector('.issqn-grid') ? 1 : 0;
    return locations * 18 + issqn * 8;
}
function createContinuationPage(page) {
    const header = page.querySelector('.danfe-header');
    const operation = page.querySelector('.operation-grid');
    const issuerRegistry = page.querySelector('.issuer-registry');
    const table = page.querySelector('.products-table');
    const sectionTitle = table?.previousElementSibling;
    const footer = page.querySelector('.danfe-footer');
    if (!header || !operation || !issuerRegistry || !table || !sectionTitle || !footer)
        return null;
    const next = page.cloneNode(false);
    next.removeAttribute('data-page');
    next.classList.remove('danfe-oversized');
    const tableClone = table.cloneNode(true);
    const body = tableClone.querySelector('tbody');
    if (!body)
        return null;
    const filler = body.querySelector('.products-filler')?.cloneNode(true) ?? null;
    body.replaceChildren();
    if (filler)
        body.append(filler);
    next.append(header.cloneNode(true), operation.cloneNode(true), issuerRegistry.cloneNode(true), sectionTitle.cloneNode(true), tableClone, footer.cloneNode(true));
    return next;
}
function insertRowsBeforeExisting(body, rows) {
    if (rows.length === 0)
        return;
    const firstRealRow = body.querySelector('tr:not(.products-filler)');
    const filler = body.querySelector('.products-filler');
    const anchor = firstRealRow ?? filler;
    if (anchor)
        anchor.before(...rows);
    else
        body.append(...rows);
}
