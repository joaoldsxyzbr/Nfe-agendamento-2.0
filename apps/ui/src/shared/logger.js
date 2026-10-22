const DEBUG_FLAG = 'nfe-debug';

function isDebugEnabled() {
  try {
    if (typeof globalThis.location !== 'undefined' && globalThis.location.search) {
      return new URLSearchParams(globalThis.location.search).has(DEBUG_FLAG);
    }
    if (typeof globalThis.process !== 'undefined' && globalThis.process.env) {
      return globalThis.process.env.NFE_DEBUG === '1';
    }
  } catch {
    // Ignora ambientes sem location/process.
  }
  return false;
}

function timestamp() {
  return new Date().toISOString();
}

const debugLog = (...args) => {
  if (isDebugEnabled()) {
    console.info(`[NFe ${timestamp()}]`, ...args);
  }
};

export const logger = {
  debug: debugLog,

  info: debugLog,

  warn(...args) {
    console.warn(`[NFe ${timestamp()}]`, ...args);
  },

  error(...args) {
    console.error(`[NFe ${timestamp()}]`, ...args);
  },
};

export function withLog(label, fn) {
  return async (...args) => {
    logger.debug(`${label} iniciado`, { args: args.length });
    const start = globalThis.performance?.now?.() ?? Date.now();
    try {
      const result = await fn(...args);
      const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - start;
      logger.debug(`${label} concluído`, { elapsedMs: Math.round(elapsed) });
      return result;
    } catch (error) {
      const elapsed = (globalThis.performance?.now?.() ?? Date.now()) - start;
      logger.warn(`${label} falhou`, { elapsedMs: Math.round(elapsed), error: error?.message });
      throw error;
    }
  };
}
