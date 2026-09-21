import type { NfeLookupResult, PortalOperationStatus, SupplierResolution } from '../bridge/contracts';
import type { AccessKeyValidation } from './access-key';
import type { ParsedNfe } from './xml';

export type ConsultationController = Readonly<{
  submit(): Promise<void>;
  completeManualImport(parsed: ParsedNfe): Promise<void>;
  reset(): void;
  cancelActivePortal(): Promise<void>;
  isPortalActive(): boolean;
}>;

type ConsultationBridgeClient = Readonly<{
  lookupNfe(accessKey: string, signal?: AbortSignal, requestId?: string): Promise<NfeLookupResult>;
  resolveSupplier(taxId: string, signal?: AbortSignal): Promise<SupplierResolution>;
}>;

type ConsultationPortalController = Readonly<{
  start(accessKey: string, signal?: AbortSignal): Promise<string>;
  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus>;
  cancel(operationId: string): Promise<void>;
}>;

export type ConsultationControllerDependencies = Readonly<{
  getAccessKey(): string;
  clearAccessKey(): void;
  validateAccessKey(value: string): AccessKeyValidation;
  bridge: ConsultationBridgeClient;
  portal: ConsultationPortalController;
  parseXml(xml: string, accessKey: string): ParsedNfe;
  renderState(title: string, message: string): void;
  renderFailure(lookup: NfeLookupResult): void;
  renderPortalFailure(title: string, message: string, accessKey: string): void;
  renderSuccess(parsed: ParsedNfe): void;
  renderInvalidXml(error: unknown): void;
  setBusy(busy: boolean): void;
  focusInput(): void;
  resetView(): void;
}>;

export function createConsultationController(
  deps: ConsultationControllerDependencies,
): ConsultationController {
  let activePortalOperationId: string | null = null;

  async function submit(): Promise<void> {
    const validation = deps.validateAccessKey(deps.getAccessKey());
    if (!validation.valid) {
      deps.renderState('Chave inválida', validation.error);
      deps.focusInput();
      return;
    }

    deps.setBusy(true);
    deps.renderState('Consultando NF-e', 'Aguardando resposta da SEFAZ pelo Bridge local…');

    try {
      const requestId = globalThis.crypto.randomUUID();
      const lookup = await deps.bridge.lookupNfe(validation.value, undefined, requestId);
      if (lookup.category === 'success' && lookup.xml) {
        await renderParsedXml(lookup.xml, validation.value);
        return;
      }

      if (
        lookup.category === 'consumption_limit'
        || (lookup.category === 'fiscal_status' && lookup.cStat === '217')
      ) {
        await runPortalFallback(validation.value, lookup);
        return;
      }

      deps.renderFailure(lookup);
    } catch (error) {
      deps.renderState(
        'Consulta não concluída',
        error instanceof Error ? error.message : 'Não foi possível concluir a consulta da NF-e.',
      );
    } finally {
      deps.setBusy(false);
    }
  }

  async function runPortalFallback(accessKey: string, lookup: NfeLookupResult): Promise<void> {
    const sefazMessage = lookup.message
      ?? 'A consulta direta da SEFAZ não retornou o XML e será tentada pelo Portal Nacional.';
    const sefazStatus = lookup.cStat ? `Status SEFAZ ${lookup.cStat}. ${sefazMessage}` : sefazMessage;

    deps.renderState(
      'Abrindo consulta alternativa',
      `${sefazStatus} Abrindo o Portal Nacional da NF-e neste computador. Resolva o hCaptcha manualmente e solicite o XML.`,
    );

    let operationId: string;
    try {
      operationId = await deps.portal.start(accessKey);
    } catch (error) {
      deps.renderPortalFailure(
        'Portal da NF-e indisponível',
        error instanceof Error ? error.message : 'Não foi possível abrir o Portal Nacional da NF-e.',
        accessKey,
      );
      return;
    }

    activePortalOperationId = operationId;
    deps.renderState(
      'Portal Nacional aberto',
      'Resolva o hCaptcha manualmente na janela do Portal e conclua a consulta. Esta página receberá o XML automaticamente.',
    );

    try {
      const portalStatus = await deps.portal.waitForResult(operationId);
      if (portalStatus.state === 'completed' && portalStatus.xml) {
        await renderParsedXml(portalStatus.xml, accessKey);
        return;
      }

      if (portalStatus.state === 'cancelled') {
        deps.renderState(
          'Consulta pelo Portal cancelada',
          portalStatus.message ?? 'A janela do Portal foi fechada antes de concluir o download do XML.',
        );
        return;
      }

      if (portalStatus.state === 'failed') {
        deps.renderPortalFailure(
          'Portal da NF-e indisponível',
          portalStatus.message ?? 'Não foi possível concluir a consulta pelo Portal Nacional da NF-e.',
          accessKey,
        );
        return;
      }

      deps.renderPortalFailure(
        'Consulta pelo Portal não concluída',
        portalStatus.message ?? 'O Portal não retornou XML.',
        accessKey,
      );
    } catch (error) {
      deps.renderPortalFailure(
        'Portal da NF-e indisponível',
        error instanceof Error ? error.message : 'Não foi possível concluir a consulta pelo Portal Nacional da NF-e.',
        accessKey,
      );
    } finally {
      if (activePortalOperationId === operationId) {
        activePortalOperationId = null;
      }
    }
  }

  async function completeManualImport(parsed: ParsedNfe): Promise<void> {
    deps.renderSuccess(await withSupplierRule(parsed));
  }

  async function renderParsedXml(xml: string, accessKey: string): Promise<void> {
    try {
      const parsed = await withSupplierRule(deps.parseXml(xml, accessKey));
      deps.renderSuccess(parsed);
    } catch (error) {
      deps.renderInvalidXml(error);
    }
  }

  async function withSupplierRule(parsed: ParsedNfe): Promise<ParsedNfe> {
    try {
      const resolution = await deps.bridge.resolveSupplier(parsed.issuer.taxId);
      return { ...parsed, supplierRuleId: resolution.supplierId };
    } catch {
      return { ...parsed, supplierRuleId: null };
    }
  }

  function reset(): void {
    deps.clearAccessKey();
    deps.resetView();
    deps.focusInput();
  }

  async function cancelActivePortal(): Promise<void> {
    const operationId = activePortalOperationId;
    activePortalOperationId = null;
    if (!operationId) return;

    try {
      await deps.portal.cancel(operationId);
    } catch {
      // pagehide/unload: best-effort.
    }
  }

  function isPortalActive(): boolean {
    return activePortalOperationId !== null;
  }

  return {
    submit,
    completeManualImport,
    reset,
    cancelActivePortal,
    isPortalActive,
  };
}
