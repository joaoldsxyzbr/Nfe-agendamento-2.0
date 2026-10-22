import { describe, expect, it } from 'vitest';
import { portalErrorGuidance } from '../src/portal/error-guidance';
describe('actionable privacy-safe Portal error guidance', () => {
    it('uses known extension codes instead of guessing from text', () => {
        expect(portalErrorGuidance('Alguma mensagem', 'portal_session_lost')).toContain('sessão');
        expect(portalErrorGuidance('Alguma mensagem', 'portal_session_lost')).toContain('Código: portal_session_lost');
        expect(portalErrorGuidance('Alguma mensagem', 'portal_download_not_found')).toContain('download');
        expect(portalErrorGuidance('Alguma mensagem', 'portal_xml_invalid')).toContain('XML');
    });
    it('preserves safe HTTP status without echoing sensitive error payloads', () => {
        const key = '1'.repeat(44);
        const message = `Portal retornou HTTP 503 para chave ${key} e cookie secreto`;
        const result = portalErrorGuidance(message, 'portal_download_http_error');
        expect(result).toContain('HTTP 503');
        expect(result).toContain('Código: portal_download_http_error');
        expect(result).not.toContain(key);
        expect(result).not.toContain('cookie');
        expect(result).not.toContain('secreto');
    });
    it('classifies known generic messages and never invents certificate failure', () => {
        expect(portalErrorGuidance('Timeout')).toContain('demorou');
        expect(portalErrorGuidance('Cancelada')).toContain('interrompida');
        expect(portalErrorGuidance('Falha de conexão')).toContain('comunicar');
        expect(portalErrorGuidance('Erro desconhecido')).toContain('Verifique a janela do Portal');
        expect(portalErrorGuidance('Erro desconhecido')).not.toContain('certificado');
    });
    it('refuses to display untrusted codes or raw identifiers', () => {
        const raw = `Erro 42260912345678000195550010000000011123456786. CPF 12345678900`;
        const result = portalErrorGuidance(raw, 'unsafe<script>alert(1)</script>');
        expect(result).not.toContain('422609');
        expect(result).not.toContain('12345678900');
        expect(result).not.toContain('<script>');
        expect(portalErrorGuidance('Sem detalhes', `portal_${'1'.repeat(44)}`)).not.toContain('Código:');
        expect(portalErrorGuidance('Timeout ao baixar XML')).toContain('demorou');
    });
});
