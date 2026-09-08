import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('site theme', () => {
  it('keeps the application dark with blue and yellow accents while DANFE stays white', () => {
    expect(styles).toContain('color-scheme: dark');
    expect(styles).toContain('--bg: #070b12');
    expect(styles).toContain('--blue: #4b8dff');
    expect(styles).toContain('--blue-strong: #2f73ea');
    expect(styles).toContain('--yellow: #f5c542');
    expect(styles).toMatch(/\.certificate-card, \.lookup-card, \.result-card[\s\S]*background:/);
    expect(styles).toMatch(/\.danfe-page[\s\S]*background:\s*#fff/);
  });
});
