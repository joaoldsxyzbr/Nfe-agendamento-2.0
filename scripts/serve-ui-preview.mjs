import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv.includes('--source');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const host = option('--host', '127.0.0.1');
const port = Number(option('--port', '4173'));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida.');

const web = fileURLToPath(new URL('../apps/ui/', import.meta.url));
const webPublic = resolve(web, 'public');
const root = source ? web : resolve(web, 'dist');
const mime = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
function within(base, pathname) {
  const resolved = resolve(base, '.' + pathname);
  const rel = relative(base, resolved);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)) ? resolved : null;
}
const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
    res.writeHead(400).end();
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const roots = source && !pathname.startsWith('/src/')
    ? [root, webPublic]
    : [root];
  for (const base of roots) {
    const path = within(base, pathname);
    if (!path) continue;
    try {
      const content = await readFile(path);
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
        res.writeHead(500).end();
        return;
      }
    }
  }
  res.writeHead(404).end();
});
server.listen(port, host, () => console.info('Site estático em http://' + host + ':' + port + ' (' + (source ? 'src' : 'dist') + ')'));
