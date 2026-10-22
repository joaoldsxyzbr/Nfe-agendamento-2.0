/**
 * Error guidance from stable extension codes. Never echo raw Portal responses,
 * invoice keys, HTTP bodies, cookies or other sensitive data into the interface.
 * Unknown codes do not justify guessing whether the certificate has failed.
 */
const KNOWN_GUIDANCE = {
    portal_download_not_found: 'O Portal não ofereceu o download a tempo. Confira a janela e tente novamente.',
    portal_download_request_missing: 'O Portal não iniciou o download do XML a tempo. Tente novamente.',
    portal_session_lost: 'A sessão do Portal não autorizou o XML. Reabra a consulta e autentique-se, se necessário.',
    portal_download_http_error: 'O Portal recusou ou falhou ao entregar o XML. Confira a sessão e tente novamente.',
    portal_xml_invalid: 'O XML oficial não pôde ser validado para esta chave. Confira a consulta.',
    invalid_xml: 'O XML não pôde ser validado. Confira a chave ou importe o XML manualmente.',
    portal_xml_too_large: 'O XML ultrapassa o limite aceito de 10 MiB.',
    portal_xml_capture_unavailable: 'Não foi possível capturar o XML na sessão atual do Portal. Tente novamente.',
    portal_request_replay_invalid: 'A requisição de download não pôde ser processada com segurança.',
    portal_popup_open_failed: 'O navegador não abriu o Portal. Confira bloqueios de janelas e tente novamente.',
    portal_tab_missing: 'A janela do Portal foi fechada. Inicie uma nova consulta.',
    portal_operation_lost: 'A operação do Portal foi interrompida. Inicie uma nova consulta.',
    portal_operation_active: 'Já existe uma consulta em andamento. Finalize ou cancele antes de iniciar outra.',
    portal_navigation_failed: 'Não foi possível navegar até o Portal. Verifique a conexão e tente novamente.',
    portal_dialog_arm_failed: 'Não foi possível preparar a consulta no Portal. Tente novamente.',
    portal_state_unavailable: 'Não foi possível recuperar o estado do Portal. Tente novamente.',
    portal_state_invalid: 'O Portal retornou um estado inesperado. Inicie uma nova consulta.',
    extension_error: 'A extensão encontrou uma falha. Confira se está ativa e tente novamente.',
};
export function portalErrorGuidance(message, code = null) {
    const safeCode = code && Object.prototype.hasOwnProperty.call(KNOWN_GUIDANCE, code) ? code : null;
    const known = safeCode ? KNOWN_GUIDANCE[safeCode] : null;
    const normalized = (message ?? '').toLocaleLowerCase('pt-BR');
    let guidance = known;
    if (!guidance && /cancelad|cancelled|canceled/.test(normalized)) {
        guidance = 'Consulta interrompida. Você pode tentar novamente.';
    }
    else if (!guidance && /tempo|timeout|expir|demor|não respondeu/.test(normalized)) {
        guidance = 'A consulta demorou além do esperado. Confira o Portal e tente novamente.';
    }
    else if (!guidance && /xml inválido|xml não.*valid|não.*validar.*xml|nfeproc|doctype|dtd/.test(normalized)) {
        guidance = 'O XML não pôde ser validado. Confira a chave ou importe o XML manualmente.';
    }
    else if (!guidance && /extens|conex|comunica|network|fetch|rede/.test(normalized)) {
        guidance = 'Não foi possível comunicar com a extensão ou o Portal. Confira a conexão.';
    }
    guidance ??= 'A consulta não foi concluída. Verifique a janela do Portal e tente novamente ou importe o XML manualmente.';
    // Only explicitly known codes and three-digit HTTP statuses may be shown.
    // The original error message can carry fiscal identifiers and is never repeated.
    const status = safeCode === 'portal_download_http_error'
        ? /\bHTTP\s+([1-5]\d\d)\b/i.exec(message ?? '')?.[1]
        : undefined;
    const detail = [safeCode ? `Código: ${safeCode}` : null, status ? `HTTP ${status}` : null]
        .filter(Boolean)
        .join(' · ');
    return detail ? `${guidance} (${detail})` : guidance;
}
