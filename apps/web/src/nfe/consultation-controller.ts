import type { PortalOperationStatus, SupplierResolution } from '../portal/contracts';
import type { AccessKeyValidation } from './access-key';
import type { ParsedNfe } from './xml';

export type ConsultationController = Readonly<{
  submit(): Promise<void>;
  completeManualImport(parsed: ParsedNfe): Promise<void>;
  reset(): void;
  cancelActivePortal(): Promise<void>;
  isPortalActive(): boolean;
}>;

type ConsultationPortalClient = Readonly<{
  isAvailable(signal?: AbortSignal): Promise<boolean>;
  start(accessKey: string, signal?: AbortSignal): Promise<string>;
  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus>;
  cancel(operationId: string): Promise<void>;
  resolveSupplier(taxId: string): Promise<SupplierResolution>;
}>;

export type ConsultationControllerDependencies = Readonly<{
  getAccessKey(): string;
  clearAccessKey(): void;
  validateAccessKey(value: string): AccessKeyValidation;
  portal: ConsultationPortalClient;
  parseXml(xml: string, accessKey: string): ParsedNfe;
  renderState(title: string, message: string): void;
  renderPortalFailure(title: string, message: string, accessKey: string): void;
  renderSuccess(parsed: ParsedNfe): void;
  renderInvalidXml(error: unknown): void;
  setBusy(busy: boolean): void;
  focusInput(): void;
  resetView(): void;
}>;

export function createConsultationController(deps: ConsultationControllerDependencies): ConsultationController {
  let activePortalOperationId: string | null = null;

  async function submit(): Promise<void> {
    const validation = deps.validateAccessKey(deps.getAccessKey());
    if (!validation.valid) {
      deps.renderState('Chave inválida', validation.error);
      deps.focusInput();
      return;
    }

    deps.setBusy(true);
    try {
      if (!await deps.portal.isAvailable()) {
        deps.renderState(
          'Extensão não conectada',
          'Instale ou ative a extensão NFe Agendamento no Chrome/Edge e tente novamente.',
        );
        return;
      }

      deps.renderState(
        'Abrindo Portal Nacional',
        'A extensão está abrindo a consulta oficial. Resolva o hCaptcha manualmente na janela do Portal.',
      );

      let operationId: string;
      try {
        operationId = await deps.portal.start(validation.value);
      } catch (error) {
        deps.renderPortalFailure(
          'Portal da NF-e indisponível',
          error instanceof Error ? error.message : 'Não foi possível abrir o Portal Nacional da NF-e.',
          validation.value,
        );
        return;
      }

      activePortalOperationId = operationId;
      deps.renderState(
        'Portal Nacional aberto',
        'Resolva o hCaptcha manualmente. O XML será devolvido automaticamente para este site.',
      );

      const portalStatus = await deps.portal.waitForResult(operationId);
      if (portalStatus.state === 'completed' && portalStatus.xml) {
        await renderParsedXml(portalStatus.xml, validation.value);
        return;
      }

      if (portalStatus.state === 'cancelled') {
        deps.renderState(
          'Consulta pelo Portal cancelada',
          portalStatus.message ?? 'A janela do Portal foi fechada antes da conclusão.',
        );
        return;
      }

      deps.renderPortalFailure(
        'Portal da NF-e indisponível',
        portalStatus.message ?? 'O Portal não retornou o XML desta NF-e.',
        validation.value,
      );
    } catch (error) {
      deps.renderPortalFailure(
        'Consulta não concluída',
        error instanceof Error ? error.message : 'Não foi possível concluir a consulta da NF-e.',
        validation.value,
      );
    } finally {
      activePortalOperationId = null;
      deps.setBusy(false);
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
      const resolution = await deps.portal.resolveSupplier(parsed.issuer.taxId);
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

  return {
    submit,
    completeManualImport,
    reset,
    cancelActivePortal,
    isPortalActive: () => activePortalOperationId !== null,
  };
}
