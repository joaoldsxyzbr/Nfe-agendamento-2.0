import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const outdir = new URL('../dist/', import.meta.url);
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [new URL('../src/background.js', import.meta.url).pathname],
  outfile: new URL('background.js', outdir).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome120'],
  sourcemap: false,
  minify: false,
});

for (const [entry, output] of [
  ['portal-content.js', 'portal-content.js'],
  ['options.js', 'options.js'],
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
await cp(new URL('../icon.png', import.meta.url), new URL('icon.png', outdir));
// A UI nativa é a interface web existente, embutida no pacote Manifest V3.
const uiRoot = new URL('../../ui/', import.meta.url);
await cp(new URL('src/', uiRoot), new URL('src/', outdir), { recursive: true });
await cp(new URL('public/brand-mark.png', uiRoot), new URL('brand-mark.png', outdir));
await cp(new URL('public/favicon.ico', uiRoot), new URL('favicon.ico', outdir));
const webHtml = await readFile(new URL('index.html', uiRoot), 'utf8');
const appHtml = webHtml
  .replace(/<script>[\s\S]*?<\/script>/, '')
  .replaceAll('href="/', 'href="./')
  .replaceAll('src="/', 'src="./');
await writeFile(new URL('app.html', outdir), appHtml);
