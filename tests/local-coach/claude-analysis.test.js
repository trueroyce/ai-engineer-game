import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildClaudeInvocation, createClaudeAnalysisService } from '../../src/local-coach/claude-analysis.js';
import { createRunWriter } from '../../src/local-coach/run-writer.js';
import { syntheticCase02Run, syntheticCase03Run, syntheticCase04Run, syntheticRun } from '../mcp/fixtures.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FAKE = path.join(ROOT, 'tests', 'local-coach', 'fake-claude.mjs');

async function setup(t, seed = 'analysis-fixture') {
  const runs = await fs.mkdtemp(path.join(os.tmpdir(), 'aieg-analysis-'));
  t.after(() => fs.rm(runs, { recursive: true, force: true }));
  const record = syntheticRun({ seed });
  await createRunWriter(runs).save(record);
  return { runs, record };
}

function fakeSpawner(mode, calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    return spawn(process.execPath, [FAKE, mode], options);
  };
}

function service({ runs, mode = 'success', calls = [], timeoutMs = 2_000, maxStdoutBytes } = {}) {
  return createClaudeAnalysisService({
    projectRoot: ROOT,
    runsDir: runs,
    claudeExecutable: process.execPath,
    nodeExecutable: process.execPath,
    spawnImpl: fakeSpawner(mode, calls),
    timeoutMs,
    ...(maxStdoutBytes ? { maxStdoutBytes } : {}),
  });
}

test('invocation has a fixed cwd, absolute MCP entry, no built-ins, exact readonly MCP, and unattended denial', () => {
  const invocation = buildClaudeInvocation({ projectRoot: ROOT, claudeExecutable: process.execPath, nodeExecutable: process.execPath });
  assert.equal(invocation.cwd, ROOT);
  assert.equal(path.isAbsolute(invocation.command), true);
  const flag = (name) => invocation.args[invocation.args.indexOf(name) + 1];
  assert.equal(flag('--tools'), '');
  assert.equal(invocation.args.includes('--restricted'), true);
  assert.equal(invocation.args.includes('--strict-mcp-config'), true);
  assert.equal(flag('--permission-mode'), 'dontAsk');
  assert.equal(flag('--permission-prompts'), 'none');
  assert.equal(invocation.args.includes('--no-session-persistence'), true);
  assert.equal(invocation.args.includes('--disable-slash-commands'), true);
  assert.doesNotMatch(invocation.args.join(' '), /dangerously|bypassPermissions|--bare/);
  const allowed = flag('--allowedTools').split(',').sort();
  assert.deepEqual(allowed, [
    'mcp__ai_game_runs__get_rules',
    'mcp__ai_game_runs__get_run',
    'mcp__ai_game_runs__list_runs',
  ]);
  const config = JSON.parse(flag('--mcp-config'));
  assert.equal(Object.keys(config.mcpServers).join(','), 'ai_game_runs');
  assert.equal(path.isAbsolute(config.mcpServers.ai_game_runs.command), true);
  assert.equal(path.isAbsolute(config.mcpServers.ai_game_runs.args[0]), true);
  assert.equal(config.mcpServers.ai_game_runs.args[0], path.join(ROOT, 'scripts', 'mcp-postgame-coach.mjs'));
});

test('successful analysis uses stdin, returns structured data, and same-run retry reuses cache', async (t) => {
  const { runs, record } = await setup(t, 'analysis-success');
  const calls = [];
  const analyzer = service({ runs, calls });
  const first = await analyzer.analyze(record.runId);
  assert.equal(first.runId, record.runId);
  assert.equal(first.reused, false);
  assert.equal(first.critique.headline, '合成局講評');
  assert.equal(first.usage.turns, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.cwd, ROOT);
  assert.equal(calls[0].options.env.ANTHROPIC_API_KEY, undefined);
  assert.equal(calls[0].options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.equal(calls[0].options.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1');
  assert.equal(calls[0].args.some((value) => value.includes(record.runId)), false);

  const repeated = await analyzer.analyze(record.runId);
  assert.equal(repeated.reused, true);
  assert.equal(calls.length, 1);
  const fresh = await analyzer.analyze(record.runId, { reanalyze: true });
  assert.equal(fresh.reused, false);
  assert.equal(calls.length, 2);
});

test('the same fixed three-tool stub analysis accepts case 02, case 03 and case 04 records', async (t) => {
  const runs = await fs.mkdtemp(path.join(os.tmpdir(), 'aieg-analysis-four-case-'));
  t.after(() => fs.rm(runs, { recursive: true, force: true }));
  const records = [syntheticCase02Run(), syntheticCase03Run(), syntheticCase04Run()];
  const writer = createRunWriter(runs);
  for (const record of records) await writer.save(record);
  for (const record of records) {
    const calls = [];
    const result = await service({ runs, calls }).analyze(record.runId);
    assert.equal(result.runId, record.runId);
    assert.equal(result.critique.headline, '合成局講評');
    assert.equal(calls.length, 1);
  }
});

test('invalid and path-shaped run IDs never spawn a process', async (t) => {
  const { runs } = await setup(t, 'analysis-injection');
  const calls = [];
  const analyzer = service({ runs, calls });
  await assert.rejects(analyzer.analyze('../secret'), (error) => error.code === 'invalid_run_id');
  await assert.rejects(analyzer.analyze('case01-0000000000000000 --tools Bash'), (error) => error.code === 'invalid_run_id');
  await assert.rejects(analyzer.analyze('case01-ffffffffffffffff'), (error) => error.code === 'run_not_found');
  assert.equal(calls.length, 0);
});

test('only one child runs; explicit cancel kills that owned child', async (t) => {
  const { runs, record } = await setup(t, 'analysis-cancel');
  const calls = [];
  const analyzer = service({ runs, mode: 'hang', calls, timeoutMs: 5_000 });
  const pending = analyzer.analyze(record.runId);
  while (!calls.length) await new Promise((resolve) => setTimeout(resolve, 5));
  await assert.rejects(analyzer.analyze(record.runId, { reanalyze: true }), (error) => error.code === 'analysis_busy');
  assert.equal(calls.length, 1);
  assert.equal(analyzer.cancel(record.runId), true);
  await assert.rejects(pending, (error) => error.code === 'analysis_cancelled');
  assert.equal(analyzer.activeRunId, null);
});

test('simultaneous requests reserve the slot before preflight for ordinary and explicit reanalysis', async (t) => {
  for (const reanalyze of [false, true]) {
    const { runs, record } = await setup(t, `analysis-simultaneous-${reanalyze}`);
    const calls = [];
    const analyzer = service({ runs, calls });
    const results = await Promise.allSettled([
      analyzer.analyze(record.runId, { reanalyze }),
      analyzer.analyze(record.runId, { reanalyze }),
    ]);
    assert.equal(calls.length, 1);
    assert.deepEqual(results.map((item) => item.status).sort(), ['fulfilled', 'rejected']);
    const rejected = results.find((item) => item.status === 'rejected');
    assert.equal(rejected.reason.code, 'analysis_busy');
  }
});

test('cancel during preflight prevents spawn and releases the slot', async (t) => {
  const { runs, record } = await setup(t, 'analysis-preflight-cancel');
  const calls = [];
  const analyzer = service({ runs, calls });
  const pending = analyzer.analyze(record.runId);
  assert.equal(analyzer.activeRunId, record.runId);
  assert.equal(analyzer.cancel(record.runId), true);
  await assert.rejects(pending, (error) => error.code === 'analysis_cancelled');
  assert.equal(calls.length, 0);
  assert.equal(analyzer.activeRunId, null);
  await analyzer.analyze(record.runId);
  assert.equal(calls.length, 1);
});

test('simultaneous different-run requests still start only one child', async (t) => {
  const { runs, record } = await setup(t, 'analysis-multi-run-one');
  const second = syntheticRun({ seed: 'analysis-multi-run-two' });
  await createRunWriter(runs).save(second);
  const calls = [];
  const analyzer = service({ runs, calls });
  const results = await Promise.allSettled([
    analyzer.analyze(record.runId),
    analyzer.analyze(second.runId),
  ]);
  assert.equal(calls.length, 1);
  assert.deepEqual(results.map((item) => item.status).sort(), ['fulfilled', 'rejected']);
  assert.equal(results.find((item) => item.status === 'rejected').reason.code, 'analysis_busy');
});

test('timeout, excessive output, and authentication errors are bounded and safely classified', async (t) => {
  const { runs, record } = await setup(t, 'analysis-bounds');
  await assert.rejects(service({ runs, mode: 'hang', timeoutMs: 40 }).analyze(record.runId), (error) => error.code === 'analysis_timeout');
  await assert.rejects(service({ runs, mode: 'huge', maxStdoutBytes: 1_024 }).analyze(record.runId), (error) => error.code === 'output_too_large');
  await assert.rejects(service({ runs, mode: 'auth' }).analyze(record.runId), (error) => error.code === 'login_required' && !error.message.includes(ROOT));
});
