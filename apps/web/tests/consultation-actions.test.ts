import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../src/consultation-actions.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/consultation-actions.css', import.meta.url), 'utf8');

describe('consultation actions layout', () => {
  it('keeps Nova consulta and Consultar grouped below the access-key field', () => {
    expect(index).toContain('/src/consultation-actions.ts');
    expect(script).toContain("lookupRow.insertAdjacentElement('afterend', actions);");
    expect(script).toContain('actions.append(reset, submit);');
    expect(script).toContain("form.querySelector('.lookup-actions')");
    expect(styles).toContain('.lookup-actions');
    expect(styles).toContain('display: flex');
    expect(styles).toContain('gap: 10px');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)');
  });
});
