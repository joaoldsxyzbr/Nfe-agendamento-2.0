import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(repoRoot, 'apps', 'web');
const mode = process.argv[2] ?? '--check';

if (mode !== '--check' && mode !== '--write') {
  console.error('Uso: node scripts/format-web.mjs --check|--write');
  process.exit(2);
}

const supportedExtensions = new Set(['.css', '.html', '.json', '.jsonc', '.ts']);
const files = [];
await collectTextFiles(webRoot, files);

const changed = [];
for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  const normalized = normalize(source);
  if (normalized === source) continue;

  changed.push(relative(repoRoot, file));
  if (mode === '--write') await writeFile(file, normalized, 'utf8');
}

if (changed.length === 0) {
  console.info(`Formato: ${files.length} arquivo(s) verificados.`);
} else if (mode === '--write') {
  console.info(`Formato normalizado em ${changed.length} arquivo(s):`);
  for (const file of changed) console.info(`- ${file}`);
} else {
  console.error('Arquivos fora do formato determinístico:');
  for (const file of changed) console.error(`- ${file}`);
  console.error('Execute npm run format:web para corrigir.');
  process.exitCode = 1;
}

function normalize(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return `${lines.map((line) => line.replace(/[ \t]+$/g, '')).join('\n')}\n`;
}

async function collectTextFiles(path, output) {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;

    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await collectTextFiles(child, output);
    } else if (entry.isFile() && supportedExtensions.has(extname(entry.name))) {
      output.push(child);
    }
  }
}
