import { BridgeClient } from './bridge/client';
import type { CertificateCatalog, CertificateSummary } from './bridge/contracts';
import './styles.css';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Elemento #app não encontrado.');
}

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">NFe Agendamento 2.0</p>
        <h1>Consultar NF-e</h1>
        <p class="subtitle">Consulta direta usando o certificado A1 deste computador.</p>
      </div>
      <div class="bridge-pill" id="bridge-status" data-state="checking" role="status" aria-live="polite">
        <span class="bridge-dot" aria-hidden="true"></span>
        <span id="bridge-status-text">Verificando Bridge…</span>
      </div>
    </header>

    <section class="certificate-card" aria-labelledby="certificate-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Certificado local</p>
          <h2 id="certificate-title">Certificado A1</h2>
        </div>
        <span class="certificate-state" id="certificate-state">Aguardando Bridge</span>
      </div>

      <label for="certificate-select">Certificado deste computador</label>
      <div class="certificate-row">
        <select id="certificate-select" disabled>
          <option value="">Verificando certificados…</option>
        </select>
        <button id="certificate-apply" type="button" disabled>Usar certificado</button>
      </div>
      <p class="help-text" id="certificate-help" aria-live="polite">A chave privada permanece no Windows. O site recebe somente nome, emissor, validade e thumbprint.</p>
    </section>

    <section class="lookup-card" aria-labelledby="lookup-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Consulta</p>
          <h2 id="lookup-title">Chave de acesso</h2>
        </div>
        <span class="key-hint">44 dígitos</span>
      </div>

      <form id="lookup-form" novalidate>
        <label for="access-key">Chave da NF-e</label>
        <div class="lookup-row">
          <input
            id="access-key"
            name="accessKey"
            inputmode="numeric"
            autocomplete="off"
            maxlength="44"
            placeholder="Digite ou cole a chave de acesso"
            aria-describedby="lookup-help"
          />
          <button type="submit">Consultar</button>
        </div>
        <p id="lookup-help" class="help-text">O processamento visual acontece neste site. O Bridge local é usado apenas quando o navegador precisa acessar certificado, SEFAZ ou Portal.</p>
      </form>
    </section>

    <section class="result-card" id="result" aria-live="polite">
      <div class="empty-state">
        <strong>Nenhuma NF-e carregada</strong>
        <span>Informe uma chave para iniciar.</span>
      </div>
    </section>
  </div>
`;

const bridgeClient = new BridgeClient();
const bridgeStatus = requireElement<HTMLElement>('#bridge-status');
const bridgeStatusText = requireElement<HTMLElement>('#bridge-status-text');
const certificateSelect = requireElement<HTMLSelectElement>('#certificate-select');
const certificateApply = requireElement<HTMLButtonElement>('#certificate-apply');
const certificateState = requireElement<HTMLElement>('#certificate-state');
const certificateHelp = requireElement<HTMLElement>('#certificate-help');

certificateApply.addEventListener('click', () => {
  void applyCertificateSelection();
});

void refreshBridgeAndCertificates();

async function refreshBridgeAndCertificates(): Promise<void> {
  setBridgeState('checking');
  setCertificateControlsEnabled(false);

  try {
    await bridgeClient.health();
    setBridgeState('connected');
    const catalog = await bridgeClient.listCertificates();
    renderCertificateCatalog(catalog);
  } catch (error) {
    renderUnavailableCertificates();
    setBridgeState(isLocalPermissionError(error) ? 'permission' : 'missing');
  }
}

async function applyCertificateSelection(): Promise<void> {
  const thumbprint = certificateSelect.value;
  if (!thumbprint) return;

  setCertificateControlsEnabled(false);
  certificateHelp.textContent = 'Salvando seleção neste computador…';

  try {
    await bridgeClient.selectCertificate(thumbprint);
    const catalog = await bridgeClient.listCertificates();
    renderCertificateCatalog(catalog);
    certificateHelp.textContent = 'Certificado selecionado. Apenas o thumbprint fica salvo localmente.';
  } catch (error) {
    certificateHelp.textContent = error instanceof Error
      ? `Não foi possível selecionar o certificado: ${error.message}`
      : 'Não foi possível selecionar o certificado.';
    setCertificateControlsEnabled(certificateSelect.options.length > 1);
  }
}

function renderCertificateCatalog(catalog: CertificateCatalog): void {
  certificateSelect.replaceChildren();

  if (catalog.certificates.length === 0) {
    certificateSelect.append(createOption('', 'Nenhum certificado A1 utilizável encontrado'));
    certificateState.textContent = 'Nenhum A1 disponível';
    setCertificateControlsEnabled(false);
    return;
  }

  certificateSelect.append(createOption('', 'Selecione um certificado'));
  for (const certificate of catalog.certificates) {
    certificateSelect.append(createCertificateOption(certificate));
  }

  if (catalog.selectedThumbprint &&
      catalog.certificates.some((certificate) => certificate.thumbprint === catalog.selectedThumbprint)) {
    certificateSelect.value = catalog.selectedThumbprint;
    certificateState.textContent = 'Certificado selecionado';
  } else {
    certificateState.textContent = 'Seleção necessária';
  }

  setCertificateControlsEnabled(true);
}

function renderUnavailableCertificates(): void {
  certificateSelect.replaceChildren(createOption('', 'Bridge local indisponível'));
  certificateState.textContent = 'Indisponível';
  setCertificateControlsEnabled(false);
}

function createCertificateOption(certificate: CertificateSummary): HTMLOptionElement {
  const expiration = new Intl.DateTimeFormat('pt-BR').format(new Date(certificate.notAfter));
  return createOption(
    certificate.thumbprint,
    `${certificate.subject} · válido até ${expiration}`,
  );
}

function createOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function setCertificateControlsEnabled(enabled: boolean): void {
  certificateSelect.disabled = !enabled;
  certificateApply.disabled = !enabled || !certificateSelect.value;

  if (enabled) {
    certificateSelect.onchange = () => {
      certificateApply.disabled = !certificateSelect.value;
    };
  }
}

function setBridgeState(state: 'checking' | 'connected' | 'missing' | 'permission'): void {
  bridgeStatus.dataset.state = state;

  switch (state) {
    case 'connected':
      bridgeStatusText.textContent = 'Bridge conectado';
      break;
    case 'permission':
      bridgeStatusText.textContent = 'Permissão de acesso local necessária';
      certificateHelp.textContent = 'Autorize o navegador a acessar o serviço local e recarregue a página.';
      break;
    case 'missing':
      bridgeStatusText.textContent = 'Bridge não encontrado';
      certificateHelp.textContent = 'Instale ou inicie o Bridge neste computador para usar o certificado A1.';
      break;
    default:
      bridgeStatusText.textContent = 'Verificando Bridge…';
  }
}

function isLocalPermissionError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return true;
  }

  return error instanceof Error && /permission|private network|local network|acesso local/i.test(error.message);
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento ${selector} não encontrado.`);
  return element;
}
