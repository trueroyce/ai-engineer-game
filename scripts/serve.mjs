// 本機靜態伺服器：只用 Node 內建模組，只綁 127.0.0.1，供瀏覽器以 ES modules 載入遊戲。
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

import { createRunWriter, RunWriteError } from '../src/local-coach/run-writer.js';
import { RUN_LIMITS } from '../src/postgame/run-schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const CAPABILITY_PATH = '/api/local-coach/capability';
const SAVE_PATH = '/api/local-coach/runs';
const CAPABILITY_SCHEMA = 'ai-engineer-game.local-coach.v1';
const decoder = new TextDecoder('utf-8', { fatal: true });

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

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, `${JSON.stringify(value)}\n`, 'application/json; charset=utf-8');
}

function localRequestContext(req, server, { requireOrigin = false } = {}) {
  const address = server.address();
  if (!address || typeof address === 'string') return false;
  const expectedHost = `${HOST}:${address.port}`;
  const expectedOrigin = `http://${expectedHost}`;
  if (req.headers.host !== expectedHost) return false;
  const origin = req.headers.origin;
  if (requireOrigin && origin !== expectedOrigin) return false;
  if (origin !== undefined && origin !== expectedOrigin) return false;
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return false;
  return true;
}

async function readJsonBody(req) {
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > RUN_LIMITS.maxFileBytes)) {
    req.resume();
    throw new RunWriteError('body_too_large', `請求不得超過 ${RUN_LIMITS.maxFileBytes} bytes`);
  }
  const chunks = [];
  let total = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > RUN_LIMITS.maxFileBytes) tooLarge = true;
    else chunks.push(chunk);
  }
  if (tooLarge) throw new RunWriteError('body_too_large', `請求不得超過 ${RUN_LIMITS.maxFileBytes} bytes`);
  let text;
  try { text = decoder.decode(Buffer.concat(chunks)); }
  catch { throw new RunWriteError('invalid_utf8', '請求內容必須是有效 UTF-8'); }
  try { return JSON.parse(text); }
  catch { throw new RunWriteError('invalid_json', '請求內容必須是有效 JSON'); }
}

function statusFor(error) {
  if (error.code === 'body_too_large') return 413;
  if (error.code === 'run_conflict') return 409;
  if (['invalid_json', 'invalid_utf8', 'invalid_schema', 'unsupported_schema', 'unsupported_rule_version', 'file_too_large'].includes(error.code)) return 400;
  if (['unsafe_root', 'unsafe_entry', 'path_escape'].includes(error.code)) return 403;
  return 500;
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

function isPrivateStaticPath(abs, root) {
  const rel = path.relative(root, abs).replaceAll('\\', '/').toLowerCase();
  return rel === '.mcp.json'
    || rel === 'runs' || rel.startsWith('runs/')
    || rel === '.git' || rel.startsWith('.git/')
    || rel === '.claude' || rel.startsWith('.claude/')
    || rel === 'docs/collaboration/raw' || rel.startsWith('docs/collaboration/raw/')
    || rel === 'docs/testing/artifacts' || rel.startsWith('docs/testing/artifacts/');
}

export function startServer({ port = 8080, root = ROOT, runsDir = path.join(root, 'runs'), quiet = false, enableLocalCoach = true } = {}) {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const writer = enableLocalCoach ? createRunWriter(runsDir) : null;
  let server;
  server = http.createServer(async (req, res) => {
    if (req.url === CAPABILITY_PATH) {
      if (!writer) return send(res, 404, 'Not Found');
      if (req.method !== 'GET') return send(res, 405, 'Method Not Allowed', undefined, { Allow: 'GET' });
      if (!localRequestContext(req, server)) return send(res, 403, 'Forbidden');
      return sendJson(res, 200, {
        schema: CAPABILITY_SCHEMA,
        endpoint: SAVE_PATH,
        csrfToken,
        maxBodyBytes: RUN_LIMITS.maxFileBytes,
      });
    }
    if (req.url === SAVE_PATH) {
      if (!writer) return send(res, 404, 'Not Found');
      if (req.method !== 'POST') return send(res, 405, 'Method Not Allowed', undefined, { Allow: 'POST' });
      if (!localRequestContext(req, server, { requireOrigin: true })) return send(res, 403, 'Forbidden');
      if (req.headers['x-aieg-csrf'] !== csrfToken) return send(res, 403, 'Forbidden');
      if (String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        req.resume();
        return send(res, 415, 'Content-Type must be application/json');
      }
      try {
        const record = await readJsonBody(req);
        const saved = await writer.save(record);
        return sendJson(res, saved.created ? 201 : 200, {
          ok: true,
          runId: saved.runId,
          fileName: saved.fileName,
          created: saved.created,
          idempotent: saved.idempotent,
        });
      } catch (error) {
        const known = error instanceof RunWriteError;
        return sendJson(res, statusFor(error), {
          ok: false,
          error: {
            code: known ? error.code : 'write_failed',
            message: known ? error.message : '局紀錄無法安全寫入',
          },
        });
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    const abs = resolveRequestPath(req.url, root);
    if (!abs) return send(res, 403, 'Forbidden');
    if (isPrivateStaticPath(abs, root)) return send(res, 404, 'Not Found');
    fs.stat(abs, (err, stat) => {
      if (err || !stat.isFile()) return send(res, 404, 'Not Found');
      const type = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(abs).pipe(res);
    });
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
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
