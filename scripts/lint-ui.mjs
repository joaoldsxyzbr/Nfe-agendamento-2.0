import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = join(repoRoot, 'apps', 'ui');
const roots = [join(uiRoot, 'src'), join(uiRoot, 'tests'), join(uiRoot, 'vitest.config.js'), join(repoRoot, 'apps', 'extension', 'src'), join(repoRoot, 'apps', 'extension', 'tests'), join(repoRoot, 'apps', 'extension', 'scripts'), join(repoRoot, 'apps', 'extension', 'vitest.config.js')];

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
  await collectJavaScript(root, files);
}

const violations = [];
for (const file of files.sort()) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
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
  console.info(`Lint adicional: ${files.length} arquivo(s) JavaScript do site e da extensão verificados.`);
}

async function collectJavaScript(path, output) {
  if (['.js', '.mjs'].includes(extname(path))) {
    output.push(path);
    return;
  }

  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await collectJavaScript(child, output);
    else if (entry.isFile() && ['.js', '.mjs'].includes(extname(entry.name))) output.push(child);
  }
}
