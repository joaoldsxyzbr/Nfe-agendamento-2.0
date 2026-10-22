import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const settings = readFileSync(new URL('../src/settings-panel.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/settings-panel.css', import.meta.url), 'utf8');
describe('settings panel extension-only', () => {
    it('diagnoses the Portal integration without direct SEFAZ configuration', () => {
        expect(settings).toContain('BrowserPortalExtensionClient');
        expect(settings).toContain("diagnosticRow('Integração'");
        expect(settings).toContain("extensionState.value.textContent = 'Conectada'");
        expect(settings).toContain("integrationState.value.textContent = ready ? 'Pronta' : 'Parcial'");
        expect(settings).toContain('client.refreshInfo()');
        expect(settings).toContain('hasRequiredExtensionCapabilities(info.capabilities)');
        expect(settings).not.toContain("compatibility !== 'outdated'");
        expect(settings).toContain("diagnosticRow('Portal Nacional'");
        expect(settings).toContain("diagnosticRow('Regras de fornecedor'");
        expect(settings).not.toContain('Consulta direta');
        expect(settings).not.toContain('fiscalIdentityConfigured');
        expect(settings).not.toContain('CNPJ do certificado');
        expect(settings).not.toContain('BridgeClient');
        expect(settings).not.toContain('WebView2');
    });
    it('opens the private repository releases page for extension updates', () => {
        expect(settings).toContain("downloadTrigger.id = 'extension-releases'");
        expect(settings).toContain("downloadTrigger.setAttribute('aria-label', 'Abrir releases da extensão no GitHub')");
        expect(settings).toContain('/releases/latest');
        expect(settings).not.toContain('releases/latest/download/NFeAgendamento-Extension.zip');
    });
    it('keeps the compact settings popup', () => {
        expect(settings).toContain("trigger.id = 'settings-trigger'");
        expect(settings).toContain("panel.id = 'settings-panel'");
        expect(settings).toContain("close.id = 'settings-close'");
        expect(styles).toContain('.settings-panel');
        expect(styles).toContain('.diagnostics-card');
    });
});
