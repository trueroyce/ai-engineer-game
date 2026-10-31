import assert from 'node:assert/strict';
import test from 'node:test';

import { cancelRunAnalysis, analyzeRun } from '../../src/postgame/run-export.js';
import { isCanonicalRunId, isSafeRunId } from '../../src/postgame/run-schema.js';

const capability = Object.freeze({
  schema: 'ai-engineer-game.local-coach.v1',
  endpoint: '/api/local-coach/runs',
  analysisEndpoint: '/api/local-coach/analyze',
  cancelEndpoint: '/api/local-coach/cancel',
  csrfToken: '0123456789abcdef0123456789abcdef',
});

function environmentFor(runId) {
  const calls = [];
  return {
    calls,
    environment: {
      async fetch(endpoint, options) {
        calls.push({ endpoint, body: JSON.parse(options.body) });
        return {
          ok: true,
          status: 200,
          async json() {
            if (endpoint === capability.analysisEndpoint) return { ok: true, runId, critique: { headline: 'ok' } };
            return { ok: true, cancelled: true };
          },
        };
      },
    },
  };
}

test('canonical generated run IDs cover all four cases with one shared contract', async () => {
  for (const prefix of ['case01', 'case02', 'case03', 'case04']) {
    const runId = `${prefix}-0123456789abcdef`;
    assert.equal(isCanonicalRunId(runId), true);
    assert.equal(isSafeRunId(runId), true);
    const { calls, environment } = environmentFor(runId);
    assert.equal((await analyzeRun(runId, capability, {}, environment)).runId, runId);
    assert.equal((await cancelRunAnalysis(runId, capability, environment)).cancelled, true);
    assert.deepEqual(calls.map((item) => item.endpoint), [capability.analysisEndpoint, capability.cancelEndpoint]);
  }
});

test('legacy safe IDs remain readable while analysis rejects noncanonical and path-shaped IDs before fetch', async () => {
  assert.equal(isSafeRunId('legacy_run-001'), true);
  assert.equal(isCanonicalRunId('legacy_run-001'), false);
  for (const runId of [
    '../secret',
    'case04-0123456789abcde',
    'case04-0123456789abcdef0',
    'case04-0123456789abcdeg',
    'CASE04-0123456789abcdef',
    'case05-0123456789abcdef',
    'case04-0123456789abcdef/../secret',
  ]) {
    const { calls, environment } = environmentFor(runId);
    await assert.rejects(analyzeRun(runId, capability, {}, environment), /runId 格式無效/);
    await assert.rejects(cancelRunAnalysis(runId, capability, environment), /runId 格式無效/);
    assert.equal(calls.length, 0);
  }
});
