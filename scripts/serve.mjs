// 本機靜態伺服器：只用 Node 內建模組，只綁 127.0.0.1，供瀏覽器以 ES modules 載入遊戲。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

// 回傳 ROOT 內的絕對路徑；任何 `..` 片段、反斜線或跳出 ROOT 的路徑回傳 null。
export function resolveRequestPath(rawUrl, root = ROOT) {
  const rawPath = String(rawUrl).split('?')[0].split('#')[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/');
  if (segments.some((s) => s === '..')) return null;
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export function startServer({ port = 8080, root = ROOT, quiet = false } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    const abs = resolveRequestPath(req.url, root);
    if (!abs) return send(res, 403, 'Forbidden');
    fs.stat(abs, (err, stat) => {
      if (err || !stat.isFile()) return send(res, 404, 'Not Found');
      const type = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(abs).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      if (!quiet) {
        const { port: actual } = server.address();
        console.log(`AI 工程接案遊戲已啟動：http://${HOST}:${actual}/`);
        console.log(`敘事案件 01：http://${HOST}:${actual}/case-01.html`);
        console.log('按 Ctrl+C 停止。');
      }
      resolve(server);
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? process.argv[2] ?? 8080);
  startServer({ port }).catch((e) => {
    console.error(`無法啟動伺服器：${e.message}`);
    process.exit(1);
  });
}
