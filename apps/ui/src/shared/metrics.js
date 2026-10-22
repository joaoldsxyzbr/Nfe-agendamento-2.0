const marks = new Map();

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

export const metrics = {
  start(label) {
    marks.set(label, now());
  },

  end(label) {
    const startTime = marks.get(label);
    if (startTime === undefined) {
      return null;
    }
    const elapsed = now() - startTime;
    marks.delete(label);
    if (globalThis.performance?.mark) {
      try {
        globalThis.performance.mark(`nfe-${label}-end`);
        globalThis.performance.measure(`nfe-${label}`, `nfe-${label}-start`, `nfe-${label}-end`);
      } catch {
        // Performance API pode não estar disponível em todos os contextos.
      }
    }
    return Math.round(elapsed);
  },

  measure(label, fn) {
    return async (...args) => {
      metrics.start(label);
      try {
        return await fn(...args);
      } finally {
        metrics.end(label);
      }
    };
  },
};
