import { lookupNfeDirect, type DirectLookupResult } from './sefaz-direct';

declare const chrome: any;

const status = requireElement<HTMLElement>('#direct-lookup-status');
const operationId = new URLSearchParams(globalThis.location.search).get('operation') ?? '';

void run();

async function run(): Promise<void> {
  if (!operationId) {
    status.textContent = 'Operação de autenticação inválida. Feche esta janela e tente novamente.';
    return;
  }

  let claimed = false;
  try {
    status.textContent =
      'Preparando a conexão segura. O Chrome/Edge pode solicitar o certificado A1 instalado no Windows.';

    const claim = await chrome.runtime.sendMessage({
      source: 'direct_lookup_page',
      type: 'claim',
      operationId,
    });

    if (
      !claim ||
      claim.type !== 'direct_lookup_request' ||
      claim.operationId !== operationId ||
      typeof claim.accessKey !== 'string' ||
      typeof claim.cnpj !== 'string'
    ) {
      throw new Error('A extensão não conseguiu preparar a autenticação do certificado A1.');
    }

    claimed = true;
    status.textContent =
      'Conectando à SEFAZ. Se o navegador solicitar, selecione o certificado A1 instalado neste computador.';

    const result = await lookupNfeDirect(claim.accessKey, claim.cnpj);
    status.textContent = 'Finalizando a consulta…';
    await sendResult(result);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : 'Não foi possível concluir a autenticação do certificado A1.';
    status.textContent = message;
    if (claimed) {
      await sendResult({
        category: 'technical_error',
        xml: null,
        cStat: null,
        message,
      }).catch(() => {});
    }
  }
}

async function sendResult(result: DirectLookupResult): Promise<void> {
  await chrome.runtime.sendMessage({
    source: 'direct_lookup_page',
    type: 'result',
    operationId,
    result,
  });
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('Elemento ' + selector + ' ausente na página de autenticação.');
  return element;
}
