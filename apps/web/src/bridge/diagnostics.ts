export type BridgeDiagnosticState =
  | 'ok'
  | 'local_access_unavailable'
  | 'incompatible'
  | 'unknown';

export function classifyBridgeFailure(error: unknown): BridgeDiagnosticState {
  if (error instanceof Error && error.message === 'Resposta inválida do Bridge') {
    return 'incompatible';
  }

  if (error instanceof TypeError) {
    return 'local_access_unavailable';
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'local_access_unavailable';
  }

  return 'unknown';
}
