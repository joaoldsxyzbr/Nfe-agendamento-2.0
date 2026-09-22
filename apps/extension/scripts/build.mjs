import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const outdir = new URL('../dist/', import.meta.url);
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [new URL('../src/background.ts', import.meta.url).pathname],
  outfile: new URL('background.js', outdir).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: false,
  minify: false,
});

for (const [entry, output] of [
  ['site-bridge.ts', 'site-bridge.js'],
  ['portal-content.ts', 'portal-content.js'],
  ['options.ts', 'options.js'],
]) {
  await build({
    entryPoints: [new URL(`../src/${entry}`, import.meta.url).pathname],
    outfile: new URL(output, outdir).pathname,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    sourcemap: false,
    minify: false,
  });
}

await cp(new URL('../manifest.json', import.meta.url), new URL('manifest.json', outdir));

await cp(new URL('../options.html', import.meta.url), new URL('options.html', outdir));
