import { describe, expect, it } from 'vitest';
import type { BridgeHealth, CertificateCatalog } from '../src/bridge/contracts';
import {
  createCertificateController,
  type CertificateControllerDependencies,
} from '../src/bridge/certificate-controller';

function createSelect() {
  let options: HTMLOptionElement[] = [];
  let value = '';
  return {
    disabled: false,
    onchange: null,
    get value() {
      return value;
    },
    set value(next: string) {
      value = next;
    },
    get options() {
      return options;
    },
    replaceChildren(...items: HTMLOptionElement[]) {
      options = [...items];
      value = items[0]?.value ?? '';
    },
    append(...items: HTMLOptionElement[]) {
      options.push(...items);
    },
  } as unknown as HTMLSelectElement;
}

function createHarness(options: {
  health?: () => Promise<BridgeHealth>;
  list?: () => Promise<CertificateCatalog>;
  select?: (thumbprint: string) => Promise<void>;
} = {}) {
  const select = createSelect();
  const applyButton = { disabled: false } as HTMLButtonElement;
  const bridgeStatus = { dataset: {} } as HTMLElement;
  const bridgeStatusText = { textContent: '' } as HTMLElement;
  const certificateState = { textContent: '' } as HTMLElement;
  const help = { textContent: '' } as HTMLElement;
  const selected: string[] = [];
  let healthCalls = 0;
  let listCalls = 0;

  const deps: CertificateControllerDependencies = {
    bridge: {
      health: async () => {
        healthCalls += 1;
        return options.health?.() ?? {
          version: 'test',
          status: 'ok',
          webView2Available: true,
          certificateSelected: true,
        };
      },
      listCertificates: async () => {
        listCalls += 1;
        return options.list?.() ?? {
          certificates: [{
            subject: 'EMPRESA TESTE',
            issuer: 'AC TESTE',
            notBefore: '2026-01-01T00:00:00Z',
            notAfter: '2027-01-01T00:00:00Z',
            thumbprint: 'ABC123',
          }],
          selectedThumbprint: 'ABC123',
        };
      },
      selectCertificate: async (thumbprint) => {
        selected.push(thumbprint);
        await options.select?.(thumbprint);
      },
    },
    elements: {
      bridgeStatus,
      bridgeStatusText,
      select,
      applyButton,
      certificateState,
      help,
    },
    createOption: (value, label) => ({ value, textContent: label } as HTMLOptionElement),
    formatDate: () => '01/01/2027',
  };

  return {
    controller: createCertificateController(deps),
    select,
    applyButton,
    bridgeStatus,
    bridgeStatusText,
    certificateState,
    help,
    selected,
    get healthCalls() { return healthCalls; },
    get listCalls() { return listCalls; },
  };
}

describe('certificate controller', () => {
  it('checks Bridge, renders the certificate catalog and enables a selected A1', async () => {
    const harness = createHarness();

    await harness.controller.refresh();

    expect(harness.healthCalls).toBe(1);
    expect(harness.listCalls).toBe(1);
    expect(harness.bridgeStatus.dataset.state).toBe('connected');
    expect(harness.bridgeStatusText.textContent).toBe('Bridge conectado');
    expect(harness.select.options).toHaveLength(2);
    expect(harness.select.options[1]?.textContent).toContain('EMPRESA TESTE');
    expect(harness.select.options[1]?.textContent).toContain('01/01/2027');
    expect(harness.select.value).toBe('ABC123');
    expect(harness.certificateState.textContent).toBe('Certificado selecionado');
    expect(harness.select.disabled).toBe(false);
    expect(harness.applyButton.disabled).toBe(false);
  });

  it('reports local permission denial without pretending the Bridge is missing', async () => {
    const harness = createHarness({
      health: async () => { throw new DOMException('negado', 'NotAllowedError'); },
    });

    await harness.controller.refresh();

    expect(harness.bridgeStatus.dataset.state).toBe('permission');
    expect(harness.bridgeStatusText.textContent).toBe('Permissão de acesso local necessária');
    expect(harness.help.textContent).toContain('Autorize o navegador');
    expect(harness.certificateState.textContent).toBe('Indisponível');
    expect(harness.select.disabled).toBe(true);
  });

  it('reports ordinary Bridge failures as missing and keeps controls unavailable', async () => {
    const harness = createHarness({
      health: async () => { throw new Error('offline'); },
    });

    await harness.controller.refresh();

    expect(harness.bridgeStatus.dataset.state).toBe('missing');
    expect(harness.bridgeStatusText.textContent).toBe('Bridge não encontrado');
    expect(harness.help.textContent).toContain('Instale ou inicie o Bridge');
    expect(harness.select.options[0]?.textContent).toBe('Bridge local indisponível');
    expect(harness.applyButton.disabled).toBe(true);
  });

  it('does not call the Bridge when no certificate is selected', async () => {
    const harness = createHarness();

    await harness.controller.applySelection();

    expect(harness.selected).toEqual([]);
    expect(harness.listCalls).toBe(0);
  });

  it('selects the chosen A1, refreshes the catalog and reports local-only persistence', async () => {
    const harness = createHarness();
    await harness.controller.refresh();
    harness.select.value = 'ABC123';

    await harness.controller.applySelection();

    expect(harness.selected).toEqual(['ABC123']);
    expect(harness.listCalls).toBe(2);
    expect(harness.help.textContent).toBe('Certificado selecionado. Apenas o thumbprint fica salvo localmente.');
  });

  it('restores controls with a readable message when certificate selection fails', async () => {
    const harness = createHarness({
      select: async () => { throw new Error('falha de seleção'); },
    });
    await harness.controller.refresh();
    harness.select.value = 'ABC123';

    await harness.controller.applySelection();

    expect(harness.help.textContent).toBe('Não foi possível selecionar o certificado: falha de seleção');
    expect(harness.select.disabled).toBe(false);
    expect(harness.applyButton.disabled).toBe(false);
  });

  it('ignores private certificate material even if an unexpected field reaches the catalog object', async () => {
    const harness = createHarness({
      list: async () => ({
        certificates: [{
          subject: 'EMPRESA TESTE',
          issuer: 'AC TESTE',
          notBefore: '2026-01-01T00:00:00Z',
          notAfter: '2027-01-01T00:00:00Z',
          thumbprint: 'ABC123',
          pfx: 'SEGREDO-NAO-EXIBIR',
          password: 'SEGREDO-NAO-EXIBIR',
        } as never],
        selectedThumbprint: null,
      }),
    });

    await harness.controller.refresh();

    const labels = Array.from(harness.select.options).map((option) => option.textContent).join(' ');
    expect(labels).not.toContain('SEGREDO-NAO-EXIBIR');
  });
});
