import { describe, expect, it } from 'vitest';
import { forAll, arbitraries, createArbitrary } from '../src/shared/property-test.js';
import { validateAccessKey } from '../src/shared/access-key.js';

describe('property-test', () => {
  it('forAll passa para predicado sempre verdadeiro', () => {
    const result = forAll(arbitraries.string, () => ({ valid: true }), { iterations: 50 });
    expect(result.valid).toBe(true);
    expect(result.iterations).toBe(50);
  });

  it('forAll encontra contraexemplo', () => {
    const result = forAll(arbitraries.string, (value) => ({
      valid: value.length < 10,
      error: 'string too long',
    }), { iterations: 100 });
    expect(result.valid).toBe(false);
    expect(result.counterexample).toBeDefined();
  });

  it('chave gerada aleatoriamente é sempre válida', () => {
    const result = forAll(
      arbitraries.validAccessKey,
      (key) => {
        const validation = validateAccessKey(key);
        return validation.valid
          ? { valid: true }
          : { valid: false, error: validation.error };
      },
      { iterations: 100, seed: 42 }
    );
    expect(result.valid).toBe(true);
  });

  it('chave com dígito verificador errado é rejeitada', () => {
    const result = forAll(
      arbitraries.validAccessKey,
      (key) => {
        const corrupted = key.slice(0, 43) + (key[43] === '0' ? '1' : '0');
        const validation = validateAccessKey(corrupted);
        return validation.valid
          ? { valid: false, error: 'chave corrompida aceita' }
          : { valid: true };
      },
      { iterations: 50, seed: 123 }
    );
    expect(result.valid).toBe(true);
  });

  it('createArbitrary cria gerador customizado', () => {
    const positiveNumbers = createArbitrary((random) => Math.floor(random() * 100) + 1);
    const result = forAll(positiveNumbers, (n) => ({ valid: n > 0 }), { iterations: 100 });
    expect(result.valid).toBe(true);
  });
});
