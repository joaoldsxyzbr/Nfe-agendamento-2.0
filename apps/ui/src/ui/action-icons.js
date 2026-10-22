const SHAPES = {
    new: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 13v6m-3-3h6"/>',
    consult: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="11" cy="15" r="3"/><path d="m13.3 17.3 2.7 2.7"/>',
    view: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v4h14v-4"/>',
    zip: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v11m-2-8h4m-4 3h4m-4 3h4m-4 5h4"/>',
    csv: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    cancel: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6m0-6 6 6"/>',
    retry: '<path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/>',
    import: '<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M4 16v5h16v-5"/>',
};
/** SVG de caminhos constantes e nomes fechados, seguro para inserção na DOM. */
export function actionIconMarkup(name) {
    return `<svg class="action-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SHAPES[name]}</svg>`;
}
