import type {
  DirectLookupResult,
  PortalOperationStatus,
  SupplierResolution,
} from '../portal/contracts';
import type { PortalExtensionInfo } from '../portal/extension-client';
import type { AccessKeyValidation } from './access-key';
import type { ParsedNfe } from './xml';

export type ConsultationController = Readonly<{
  submit(): Promise<void>;
  completeManualImport(parsed: ParsedNfe): Promise<void>;
  reset(): void;
  cancelActivePortal(): Promise<void>;
  isPortalActive(): boolean;
}>;

type ConsultationExtensionClient = Readonly<{
  getInfo(signal?: AbortSignal): Promise<PortalExtensionInfo | null>;
  openOptions(signal?: AbortSignal): Promise<void>;
  directLookup(accessKey: string, signal?: AbortSignal): Promise<DirectLookupResult>;
  start(accessKey: string, signal?: AbortSignal): Promise<string>;
  waitForResult(operationId: string, signal?: AbortSignal): Promise<PortalOperationStatus>;
  cancel(operationId: string): Promise<void>;
  resolveSupplier(taxId: string): Promise<SupplierResolution>;
}>;

export type ConsultationControllerDependencies = Readonly<{
  getAccessKey(): string;
  clearAccessKey(): void;
  validateAccessKey(value: string): AccessKeyValidation;
  portal: ConsultationExtensionClient;
  parseXml(xml: string, accessKey: string): ParsedNfe;
  renderState(title: string, message: string): void;
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
    try {
      const info = await deps.portal.getInfo();
      if (!info) {
        deps.renderState(
          'Extensão não conectada',
          'Instale ou ative a extensão NFe Agendamento no Chrome/Edge e tente novamente.',
        );
        return;
      }
      if (!info.capabilities.directLookup) {
        deps.renderState(
          'Atualize a extensão',
          'Esta versão da extensão ainda não possui consulta direta à SEFAZ.',
        );
        return;
      }

      if (!info.configuration.fiscalIdentityConfigured) {
        if (!info.capabilities.openOptions) {
          deps.renderState(
            'Atualize a extensão',
            'Sua extensão é anterior ao preflight automático. Atualize pela seta de download ou clique no ícone NFe Agendamento e configure o CNPJ do A1 manualmente.',
          );
          return;
        }

        let opened = false;
        try {
          await deps.portal.openOptions();
          opened = true;
        } catch {}

        deps.renderState(
          'Configure o CNPJ do A1',
          opened
            ? 'A configuração da extensão foi aberta. Informe o CNPJ do certificado A1, salve e consulte novamente. Nenhuma consulta foi enviada à SEFAZ.'
            : 'Não foi possível abrir a configuração automaticamente. Clique no ícone NFe Agendamento, informe o CNPJ do A1 e tente novamente. Nenhuma consulta foi enviada à SEFAZ.',
        );
        return;
      }

      deps.renderState('Consultando NF-e', 'Consultando diretamente a SEFAZ com o certificado A1 do navegador…');
      const lookup = await deps.portal.directLookup(validation.value);

      if (lookup.category === 'success' && lookup.xml) {
        await renderParsedXml(lookup.xml, validation.value);
        return;
      }

      if (
        lookup.category === 'consumption_limit' ||
        (lookup.category === 'fiscal_status' && lookup.cStat === '217')
      ) {
        await runPortalFallback(validation.value, lookup);
        return;
      }

      renderDirectFailure(lookup);
    } catch (error) {
      deps.renderState(
        'Consulta não concluída',
        error instanceof Error ? error.message : 'Não foi possível concluir a consulta da NF-e.',
      );
    } finally {
      deps.setBusy(false);
    }
  }

  function renderDirectFailure(lookup: DirectLookupResult): void {
    if (lookup.category === 'configuration_error') {
      deps.renderState('Configuração necessária', lookup.message);
      return;
    }
    if (lookup.category === 'fiscal_status') {
      deps.renderState(
        lookup.cStat ? `Resultado SEFAZ ${lookup.cStat}` : 'Resultado fiscal',
        lookup.message,
      );
      return;
    }
    deps.renderState(
      lookup.category === 'transport_unavailable' ? 'Consulta direta indisponível' : 'Consulta não concluída',
      lookup.message,
    );
  }

  async function runPortalFallback(accessKey: string, lookup: DirectLookupResult): Promise<void> {
    const sefazStatus = lookup.cStat
      ? `Status SEFAZ ${lookup.cStat}. ${lookup.message}`
      : lookup.message;

    deps.renderState(
      'Abrindo consulta alternativa',
      `${sefazStatus} Abrindo o Portal Nacional da NF-e. Resolva o hCaptcha manualmente.`,
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
      'Resolva o hCaptcha manualmente. O XML será devolvido automaticamente para este site.',
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
          portalStatus.message ?? 'A janela do Portal foi fechada antes da conclusão.',
        );
        return;
      }
      deps.renderPortalFailure(
        'Portal da NF-e indisponível',
        portalStatus.message ?? 'O Portal não retornou o XML desta NF-e.',
        accessKey,
      );
    } catch (error) {
      deps.renderPortalFailure(
        'Portal da NF-e indisponível',
        error instanceof Error ? error.message : 'Não foi possível concluir a consulta pelo Portal Nacional da NF-e.',
        accessKey,
      );
    } finally {
      if (activePortalOperationId === operationId) activePortalOperationId = null;
    }
  }

  async function completeManualImport(parsed: ParsedNfe): Promise<void> {
    deps.renderSuccess(await withSupplierRule(parsed));
  }

  async function renderParsedXml(xml: string, accessKey: string): Promise<void> {
    try {
      deps.renderSuccess(await withSupplierRule(deps.parseXml(xml, accessKey)));
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
    try { await deps.portal.cancel(operationId); } catch {}
  }

  return {
    submit,
    completeManualImport,
    reset,
    cancelActivePortal,
    isPortalActive: () => activePortalOperationId !== null,
  };
}
