import { describe, expect, it } from 'vitest';
import { createBatchController } from '../src/batch/controller';
const A = '42260912345678000195550010000000011123456786';
const B = '35260812345678000195550010000000011000000018';
describe('batch outcome regression', () => {
    it('shows the real success/error totals before and after retry', async () => {
        const input = { value: `${A}\n${B}`, disabled: false, focus() { } };
        const route = { textContent: '' };
        const progress = { textContent: '' };
        const zip = { disabled: true, hidden: true };
        const starts = [];
        const controller = createBatchController({
            elements: {
                keysInput: input,
                inputSummary: { textContent: '' },
                startButton: { disabled: false, hidden: false },
                cancelButton: { hidden: true },
                resetButton: { hidden: false, disabled: false },
                zipButton: zip,
                printButton: { disabled: true, hidden: true },
                progress,
                routeText: route,
                toolbar: { hidden: true },
                list: { hidden: true },
            },
            portal: {
                getInfo: async () => ({
                    version: '0.2.16',
                    capabilities: { openOptions: true, portalLookup: true, supplierResolution: true },
                }),
                start: async (accessKey) => {
                    starts.push(accessKey);
                    return `op-${starts.length}`;
                },
                waitForResult: async (operationId) => operationId === 'op-2'
                    ? { operationId, state: 'failed', message: 'Sessão expirada', code: 'portal_session_lost', xml: null }
                    : { operationId, state: 'completed', message: null, xml: '<xml />' },
                cancel: async () => { },
                resolveSupplier: async () => ({ supplierId: null }),
            },
            parseXml: (xml, accessKey) => ({
                accessKey,
                originalXml: xml,
                issuer: { name: 'Teste', taxId: '12345678000195' },
                totals: { invoice: 10 },
                number: '1',
                series: '1',
            }),
            createZip: () => new Blob(),
            downloadBlob: () => { },
            openDanfe: () => { },
            downloadXml: () => { },
            openDanfeDocuments: () => { },
            printWindow: () => { },
            importManualXml: async () => null,
            renderRows: () => { },
        });
        controller.syncDraft();
        await controller.start();
        expect(route.textContent).toContain('1 concluída(s) · 1 com erro');
        expect(zip.disabled).toBe(false);
        await controller.retryPortal(1);
        expect(starts).toEqual([A, B, B]);
        expect(route.textContent).toContain('2 concluída(s) · 0 com erro');
        expect(progress.textContent).toBe('2 de 2');
    });
});
