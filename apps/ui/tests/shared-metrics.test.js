import { describe, expect, it, vi } from 'vitest';
import { metrics } from '../src/shared/metrics.js';

describe('metrics', () => {
  it('mede tempo de start/end', async () => {
    metrics.start('test');
    await new Promise((resolve) => setTimeout(resolve, 10));
    const elapsed = metrics.end('test');
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(typeof elapsed).toBe('number');
  });

  it('retorna null para label não iniciado', () => {
    expect(metrics.end('nonexistent')).toBeNull();
  });

  it('measure envolve função assíncrona', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const wrapped = metrics.measure('test-measure', fn);
    const result = await wrapped('arg1');
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledWith('arg1');
  });

  it('measure propaga erros', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const wrapped = metrics.measure('test-error', fn);
    await expect(wrapped()).rejects.toThrow('fail');
  });
});
