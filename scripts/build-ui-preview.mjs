import { cp, mkdir, rm } from 'node:fs/promises';

const web = new URL('../apps/ui/', import.meta.url);
const output = new URL('../apps/ui/dist/', import.meta.url);

// Apenas copia os arquivos públicos. Sem bundler, transpiler ou código de servidor.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('public/', web), output, { recursive: true });
await cp(new URL('src/', web), new URL('src/', output), { recursive: true });
for (const page of ['index.html', 'extension-test.html']) {
  await cp(new URL(page, web), new URL(page, output));
}
console.info('Site estático gerado em apps/ui/dist (HTML, CSS, JS e recursos).');
