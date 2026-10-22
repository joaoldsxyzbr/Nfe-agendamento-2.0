import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const batch = readFileSync(new URL('../src/batch/controller.js', import.meta.url), 'utf8');
describe('Portal-only integration', () => {
    it('uses the same Portal path for one or many NF-e', () => {
        expect(main).toContain('new BrowserPortalExtensionClient()');
        expect(main).not.toContain('BridgeClient');
        expect(main).not.toContain('mode-single');
        expect(main).not.toContain('mode-batch');
        expect(batch).not.toContain('directLookup');
        expect(batch).toContain('deps.portal.start(item.accessKey, signal)');
        expect(batch).not.toContain("route = 'portal'");
    });
    it('keeps captcha manual, cancellation explicit and manual XML as recovery only', () => {
        expect(batch).toContain('Resolva o hCaptcha na janela do Portal.');
        expect(batch).toContain("status.state === 'cancelled'");
        expect(batch).toContain("item.status !== 'portal_error'");
        expect(batch).toContain('deps.importManualXml(item.accessKey)');
        expect(main).toContain("window.addEventListener('pagehide'");
    });
});
