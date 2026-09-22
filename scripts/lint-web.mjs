import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = join(repoRoot, 'apps', 'web');
const roots = [join(webRoot, 'src'), join(webRoot, 'tests'), join(webRoot, 'vite.config.ts')];

const rules = [
  { name: 'debugger', pattern: /\bdebugger\s*;/g },
  { name: '@ts-ignore', pattern: /@ts-ignore\b/g },
  { name: '@ts-nocheck', pattern: /@ts-nocheck\b/g },
  { name: 'eval()', pattern: /\beval\s*\(/g },
  { name: 'new Function()', pattern: /\bnew\s+Function\s*\(/g },
  { name: 'console.log/debug', pattern: /\bconsole\.(?:log|debug)\s*\(/g },
];

const files = [];
for (const root of roots) {
  await collectTypeScript(root, files);
}

const violations = [];
for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${relative(repoRoot, file)}:${line} — ${rule.name}`);
    }
  }
}

if (violations.length > 0) {
  console.error('Lint do frontend encontrou padrões não permitidos:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.info(`Lint adicional: ${files.length} arquivo(s) TypeScript verificados.`);
}

async function collectTypeScript(path, output) {
  if (extname(path) === '.ts') {
    output.push(path);
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await collectTypeScript(child, output);
    else if (entry.isFile() && extname(entry.name) === '.ts') output.push(child);
  }
}
