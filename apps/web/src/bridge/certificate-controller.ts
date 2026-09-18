import type { BridgeHealth, CertificateCatalog } from './contracts';

export type CertificateController = Readonly<{
  refresh(): Promise<void>;
  applySelection(): Promise<void>;
  setControlsEnabled(enabled: boolean): void;
  hasSelectableCertificates(): boolean;
}>;

type CertificateBridgeClient = Readonly<{
  health(): Promise<BridgeHealth>;
  listCertificates(): Promise<CertificateCatalog>;
  selectCertificate(thumbprint: string): Promise<void>;
}>;

type CertificateElements = Readonly<{
  bridgeStatus: HTMLElement;
  bridgeStatusText: HTMLElement;
  select: HTMLSelectElement;
  applyButton: HTMLButtonElement;
  certificateState: HTMLElement;
  help: HTMLElement;
}>;

export type CertificateControllerDependencies = Readonly<{
  bridge: CertificateBridgeClient;
  elements: CertificateElements;
  createOption?: (value: string, label: string) => HTMLOptionElement;
  formatDate?: (value: string) => string;
}>;

export function createCertificateController(
  deps: CertificateControllerDependencies,
): CertificateController {
  const { elements } = deps;
  const createOption = deps.createOption ?? createDomOption;
  const formatDate = deps.formatDate ?? ((value: string) => new Intl.DateTimeFormat('pt-BR').format(new Date(value)));

  async function refresh(): Promise<void> {
    setBridgeState('checking');
    setControlsEnabled(false);

    try {
      await deps.bridge.health();
      setBridgeState('connected');
      const catalog = await deps.bridge.listCertificates();
      renderCatalog(catalog);
    } catch (error) {
      renderUnavailable();
      setBridgeState(isLocalPermissionError(error) ? 'permission' : 'missing');
    }
  }

  async function applySelection(): Promise<void> {
    const thumbprint = elements.select.value;
    if (!thumbprint) return;

    setControlsEnabled(false);
    elements.help.textContent = 'Salvando seleção neste computador…';

    try {
      await deps.bridge.selectCertificate(thumbprint);
      const catalog = await deps.bridge.listCertificates();
      renderCatalog(catalog);
      elements.help.textContent = 'Certificado selecionado. Apenas o thumbprint fica salvo localmente.';
    } catch (error) {
      elements.help.textContent = error instanceof Error
        ? `Não foi possível selecionar o certificado: ${error.message}`
        : 'Não foi possível selecionar o certificado.';
      setControlsEnabled(hasSelectableCertificates());
    }
  }

  function renderCatalog(catalog: CertificateCatalog): void {
    elements.select.replaceChildren();

    if (catalog.certificates.length === 0) {
      elements.select.append(createOption('', 'Nenhum certificado A1 utilizável encontrado'));
      elements.certificateState.textContent = 'Nenhum A1 disponível';
      setControlsEnabled(false);
      return;
    }

    elements.select.append(createOption('', 'Selecione um certificado'));
    for (const certificate of catalog.certificates) {
      elements.select.append(createOption(
        certificate.thumbprint,
        `${certificate.subject} · válido até ${formatDate(certificate.notAfter)}`,
      ));
    }

    if (
      catalog.selectedThumbprint
      && catalog.certificates.some((certificate) => certificate.thumbprint === catalog.selectedThumbprint)
    ) {
      elements.select.value = catalog.selectedThumbprint;
      elements.certificateState.textContent = 'Certificado selecionado';
    } else {
      elements.certificateState.textContent = 'Seleção necessária';
    }

    setControlsEnabled(true);
  }

  function renderUnavailable(): void {
    elements.select.replaceChildren(createOption('', 'Bridge local indisponível'));
    elements.certificateState.textContent = 'Indisponível';
    setControlsEnabled(false);
  }

  function setControlsEnabled(enabled: boolean): void {
    elements.select.disabled = !enabled;
    elements.applyButton.disabled = !enabled || !elements.select.value;

    if (enabled) {
      elements.select.onchange = () => {
        elements.applyButton.disabled = !elements.select.value;
      };
    }
  }

  function hasSelectableCertificates(): boolean {
    return elements.select.options.length > 1;
  }

  function setBridgeState(state: 'checking' | 'connected' | 'missing' | 'permission'): void {
    elements.bridgeStatus.dataset.state = state;

    switch (state) {
      case 'connected':
        elements.bridgeStatusText.textContent = 'Bridge conectado';
        break;
      case 'permission':
        elements.bridgeStatusText.textContent = 'Permissão de acesso local necessária';
        elements.help.textContent = 'Autorize o navegador a acessar o serviço local e recarregue a página.';
        break;
      case 'missing':
        elements.bridgeStatusText.textContent = 'Bridge não encontrado';
        elements.help.textContent = 'Instale ou inicie o Bridge neste computador para usar o certificado A1.';
        break;
      default:
        elements.bridgeStatusText.textContent = 'Verificando Bridge…';
    }
  }

  return {
    refresh,
    applySelection,
    setControlsEnabled,
    hasSelectableCertificates,
  };
}

function createDomOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function isLocalPermissionError(error: unknown): boolean {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return true;
  }

  return error instanceof Error && /permission|private network|local network|acesso local/i.test(error.message);
}
