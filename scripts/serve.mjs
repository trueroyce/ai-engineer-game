// 本機靜態伺服器：只用 Node 內建模組，只綁 127.0.0.1，供瀏覽器以 ES modules 載入遊戲。
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

import { AnalysisError, createClaudeAnalysisService } from '../src/local-coach/claude-analysis.js';
import { createRunWriter, RunWriteError } from '../src/local-coach/run-writer.js';
import { RUN_LIMITS } from '../src/postgame/run-schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const CAPABILITY_PATH = '/api/local-coach/capability';
const SAVE_PATH = '/api/local-coach/runs';
const ANALYZE_PATH = '/api/local-coach/analyze';
const CANCEL_PATH = '/api/local-coach/cancel';
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

function analysisStatusFor(error) {
  if (error.code === 'body_too_large') return 413;
  if (['invalid_json', 'invalid_utf8'].includes(error.code)) return 400;
  if (['invalid_run_id', 'invalid_request'].includes(error.code)) return 400;
  if (error.code === 'run_not_found') return 404;
  if (error.code === 'analysis_busy') return 409;
  if (['bridge_unavailable', 'mcp_unavailable', 'login_required', 'quota_unavailable'].includes(error.code)) return 503;
  if (error.code === 'analysis_timeout') return 504;
  return 500;
}

function exactObject(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AnalysisError('invalid_request', '請求必須是 object');
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new AnalysisError('invalid_request', '請求包含未知欄位');
  return value;
}

function protectedJsonPost(req, res, server, csrfToken) {
  if (req.method !== 'POST') {
    send(res, 405, 'Method Not Allowed', undefined, { Allow: 'POST' });
    return false;
  }
  if (!localRequestContext(req, server, { requireOrigin: true }) || req.headers['x-aieg-csrf'] !== csrfToken) {
    send(res, 403, 'Forbidden');
    return false;
  }
  if (String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    req.resume();
    send(res, 415, 'Content-Type must be application/json');
    return false;
  }
  return true;
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

export function startServer({ port = 8080, root = ROOT, runsDir = path.join(root, 'runs'), quiet = false, enableLocalCoach = true, analysisService = null } = {}) {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const writer = enableLocalCoach ? createRunWriter(runsDir) : null;
  const analyzer = writer ? (analysisService ?? createClaudeAnalysisService({ projectRoot: root, runsDir })) : null;
  let server;
  server = http.createServer(async (req, res) => {
    if (req.url === CAPABILITY_PATH) {
      if (!writer) return send(res, 404, 'Not Found');
      if (req.method !== 'GET') return send(res, 405, 'Method Not Allowed', undefined, { Allow: 'GET' });
      if (!localRequestContext(req, server)) return send(res, 403, 'Forbidden');
      return sendJson(res, 200, {
        schema: CAPABILITY_SCHEMA,
        endpoint: SAVE_PATH,
        analysisEndpoint: ANALYZE_PATH,
        cancelEndpoint: CANCEL_PATH,
        csrfToken,
        maxBodyBytes: RUN_LIMITS.maxFileBytes,
      });
    }
    if (req.url === SAVE_PATH) {
      if (!writer) return send(res, 404, 'Not Found');
      if (!protectedJsonPost(req, res, server, csrfToken)) return;
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
    if (req.url === ANALYZE_PATH) {
      if (!analyzer) return send(res, 404, 'Not Found');
      if (!protectedJsonPost(req, res, server, csrfToken)) return;
      try {
        const body = exactObject(await readJsonBody(req), ['runId', 'reanalyze']);
        if (typeof body.runId !== 'string') throw new AnalysisError('invalid_run_id', 'runId 格式無效');
        if (body.reanalyze !== undefined && typeof body.reanalyze !== 'boolean') throw new AnalysisError('invalid_request', 'reanalyze 必須是 boolean');
        const result = await analyzer.analyze(body.runId, { reanalyze: body.reanalyze ?? false });
        return sendJson(res, 200, { ok: true, ...result });
      } catch (error) {
        const known = error instanceof AnalysisError || error instanceof RunWriteError;
        const safe = known ? error : new AnalysisError('analysis_failed', 'Claude 分析失敗，這次沒有產生講評。');
        return sendJson(res, analysisStatusFor(safe), { ok: false, error: { code: safe.code, message: safe.message } });
      }
    }
    if (req.url === CANCEL_PATH) {
      if (!analyzer) return send(res, 404, 'Not Found');
      if (!protectedJsonPost(req, res, server, csrfToken)) return;
      try {
        const body = exactObject(await readJsonBody(req), ['runId']);
        if (typeof body.runId !== 'string') throw new AnalysisError('invalid_run_id', 'runId 格式無效');
        const cancelled = analyzer.cancel(body.runId);
        return sendJson(res, cancelled ? 202 : 409, {
          ok: cancelled,
          cancelled,
          ...(cancelled ? {} : { error: { code: 'not_running', message: '這局目前沒有正在執行的分析。' } }),
        });
      } catch (error) {
        const safe = error instanceof AnalysisError ? error : new AnalysisError('analysis_failed', '取消分析失敗。');
        return sendJson(res, analysisStatusFor(safe), { ok: false, error: { code: safe.code, message: safe.message } });
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
