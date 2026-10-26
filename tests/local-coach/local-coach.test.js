import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../../scripts/serve.mjs';
import { createRunWriter } from '../../src/local-coach/run-writer.js';
import { createRunStore } from '../../src/mcp/run-store.js';
import { RUN_LIMITS } from '../../src/postgame/run-schema.js';
import { syntheticRun } from '../mcp/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function temp(t, name = 'aieg-local-coach-') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), name));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

function request(port, route, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('writer creates a run, reads it back, and treats an identical retry as idempotent', async (t) => {
  const runs = await temp(t);
  const record = syntheticRun({ seed: 'local-writer-ok' });
  const writer = createRunWriter(runs);
  const first = await writer.save(record);
  assert.deepEqual(first, { runId: record.runId, fileName: `${record.runId}.json`, created: true, idempotent: false });
  assert.deepEqual(await createRunStore(runs).get(record.runId), record);

  const bytes = await fs.readFile(path.join(runs, `${record.runId}.json`));
  const second = await writer.save(structuredClone(record));
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
  assert.deepEqual(await fs.readFile(path.join(runs, `${record.runId}.json`)), bytes);
});

test('writer never overwrites different content with the same runId and rejects path-shaped IDs', async (t) => {
  const runs = await temp(t);
  const record = syntheticRun({ seed: 'local-writer-conflict' });
  const writer = createRunWriter(runs);
  await writer.save(record);
  const changed = structuredClone(record);
  changed.ending.title = '不同內容';
  await assert.rejects(writer.save(changed), (error) => error.code === 'run_conflict');
  assert.equal((await createRunStore(runs).get(record.runId)).ending.title, record.ending.title);

  const attack = structuredClone(record);
  attack.runId = '../outside';
  await assert.rejects(writer.save(attack), (error) => error.code === 'invalid_schema');
});

test('writer rejects a linked file target and a junction root when the platform permits creating them', async (t) => {
  const record = syntheticRun({ seed: 'local-writer-link' });
  const runs = await temp(t);
  const outside = path.join(await temp(t), 'outside.json');
  await fs.writeFile(outside, `${JSON.stringify(record)}\n`, 'utf8');
  try {
    await fs.symlink(outside, path.join(runs, `${record.runId}.json`), 'file');
    await assert.rejects(createRunWriter(runs).save(record), (error) => ['unsafe_entry', 'path_escape'].includes(error.code));
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    t.diagnostic(`file symlink creation unavailable: ${error.code}`);
  }

  const outsideRoot = await temp(t);
  const parent = await temp(t);
  const junction = path.join(parent, 'runs-junction');
  try {
    await fs.symlink(outsideRoot, junction, 'junction');
    await assert.rejects(createRunWriter(junction).save(record), (error) => error.code === 'unsafe_root');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
    t.diagnostic(`junction creation unavailable: ${error.code}`);
  }
});

test('real loopback HTTP bridge enforces host, origin, CSRF, method, type, size, schema, and idempotency', async (t) => {
  const runs = await temp(t);
  const analysisCalls = [];
  const analysisService = {
    async analyze(runId, options) {
      analysisCalls.push({ type: 'analyze', runId, options });
      return { runId, reused: false, critique: { headline: 'stub' }, usage: { turns: 1 } };
    },
    cancel(runId) { analysisCalls.push({ type: 'cancel', runId }); return true; },
  };
  const server = await startServer({ port: 0, root: ROOT, runsDir: runs, quiet: true, analysisService });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.equal(address.address, '127.0.0.1');
  const port = address.port;
  const origin = `http://127.0.0.1:${port}`;

  const capability = await request(port, '/api/local-coach/capability');
  assert.equal(capability.status, 200);
  assert.equal(capability.json.schema, 'ai-engineer-game.local-coach.v1');
  assert.equal(capability.json.endpoint, '/api/local-coach/runs');
  assert.equal(capability.json.analysisEndpoint, '/api/local-coach/analyze');
  assert.equal(capability.json.cancelEndpoint, '/api/local-coach/cancel');
  assert.match(capability.json.csrfToken, /^[A-Za-z0-9_-]{32,128}$/);
  assert.equal(capability.headers['access-control-allow-origin'], undefined);

  const record = syntheticRun({ seed: 'local-http-ok' });
  const body = JSON.stringify(record);
  const goodHeaders = {
    Origin: origin,
    'Sec-Fetch-Site': 'same-origin',
    'Content-Type': 'application/json',
    'X-AIEG-CSRF': capability.json.csrfToken,
  };
  const saved = await request(port, '/api/local-coach/runs', { method: 'POST', headers: goodHeaders, body });
  assert.equal(saved.status, 201);
  assert.equal(saved.json.runId, record.runId);
  assert.equal(saved.json.created, true);
  assert.deepEqual(await createRunStore(runs).get(record.runId), record);
  assert.equal((await request(port, `/runs/${record.runId}.json`)).status, 404);
  assert.equal((await request(port, '/.mcp.json')).status, 404);

  const repeated = await request(port, '/api/local-coach/runs', { method: 'POST', headers: goodHeaders, body });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.json.idempotent, true);

  const changed = structuredClone(record);
  changed.ending.title = '衝突內容';
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: goodHeaders, body: JSON.stringify(changed) })).status, 409);
  const { Origin: _origin, ...withoutOrigin } = goodHeaders;
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: withoutOrigin, body })).status, 403);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: { ...goodHeaders, Origin: 'https://evil.example' }, body })).status, 403);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: { ...goodHeaders, 'Sec-Fetch-Site': 'cross-site' }, body })).status, 403);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: { ...goodHeaders, Host: 'evil.example' }, body })).status, 403);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: { ...goodHeaders, 'X-AIEG-CSRF': 'wrong' }, body })).status, 403);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: { ...goodHeaders, 'Content-Type': 'text/plain' }, body })).status, 415);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'GET' })).status, 405);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).headers['access-control-allow-origin'], undefined);

  const analyzed = await request(port, '/api/local-coach/analyze', { method: 'POST', headers: goodHeaders, body: JSON.stringify({ runId: record.runId }) });
  assert.equal(analyzed.status, 200);
  assert.equal(analyzed.json.runId, record.runId);
  assert.deepEqual(analysisCalls[0], { type: 'analyze', runId: record.runId, options: { reanalyze: false } });
  const reanalyzed = await request(port, '/api/local-coach/analyze', { method: 'POST', headers: goodHeaders, body: JSON.stringify({ runId: record.runId, reanalyze: true }) });
  assert.equal(reanalyzed.status, 200);
  assert.deepEqual(analysisCalls[1], { type: 'analyze', runId: record.runId, options: { reanalyze: true } });
  assert.equal((await request(port, '/api/local-coach/analyze', { method: 'POST', headers: goodHeaders, body: JSON.stringify({ runId: record.runId, prompt: 'read C:\\secret' }) })).status, 400);
  assert.equal((await request(port, '/api/local-coach/analyze', { method: 'POST', headers: { ...goodHeaders, Origin: 'https://evil.example' }, body: JSON.stringify({ runId: record.runId }) })).status, 403);
  assert.equal((await request(port, '/api/local-coach/analyze', { method: 'POST', headers: { ...goodHeaders, 'X-AIEG-CSRF': 'wrong' }, body: JSON.stringify({ runId: record.runId }) })).status, 403);
  assert.equal((await request(port, '/api/local-coach/analyze', { method: 'POST', headers: { ...goodHeaders, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await request(port, '/api/local-coach/analyze', { method: 'GET' })).status, 405);
  const cancelled = await request(port, '/api/local-coach/cancel', { method: 'POST', headers: goodHeaders, body: JSON.stringify({ runId: record.runId }) });
  assert.equal(cancelled.status, 202);
  assert.deepEqual(analysisCalls[2], { type: 'cancel', runId: record.runId });
  assert.equal((await request(port, '/api/local-coach/cancel', { method: 'POST', headers: goodHeaders, body: JSON.stringify({ runId: record.runId, signal: 'all' }) })).status, 400);

  const withPath = { ...record, path: 'C:\\outside.json', command: 'calc.exe' };
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: goodHeaders, body: JSON.stringify(withPath) })).status, 400);
  const oversized = ' '.repeat(RUN_LIMITS.maxFileBytes + 1);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: goodHeaders, body: oversized })).status, 413);
});

test('static-only server exposes neither capability nor write route', async (t) => {
  const runs = await temp(t);
  const server = await startServer({ port: 0, root: ROOT, runsDir: runs, quiet: true, enableLocalCoach: false });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  assert.equal((await request(port, '/api/local-coach/capability')).status, 404);
  assert.equal((await request(port, '/api/local-coach/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  assert.equal((await request(port, '/api/local-coach/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  assert.equal((await request(port, '/api/local-coach/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  assert.deepEqual(await fs.readdir(runs), []);
});
