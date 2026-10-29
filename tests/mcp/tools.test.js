import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRunStore } from '../../src/mcp/run-store.js';
import { createToolService, TOOL_DEFINITIONS } from '../../src/mcp/tools.js';
import { RUN_LIMITS } from '../../src/postgame/run-schema.js';
import { syntheticCase02Run, syntheticCase03Run, syntheticCase04Run, syntheticRun, sha256 } from './fixtures.js';

async function fixture(t, record) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aieg-mcp-tools-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'run.json');
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
  await fs.writeFile(file, bytes);
  return { service: createToolService(createRunStore(dir)), file, hash: sha256(bytes) };
}

function payload(result) { return JSON.parse(result.content[0].text); }
function assertTextBound(result) {
  assert.equal(Buffer.byteLength(result.content[0].text, 'utf8') <= RUN_LIMITS.maxToolTextBytes, true);
}

test('tool list is exactly three closed-schema read-only tools', () => {
  assert.deepEqual(TOOL_DEFINITIONS.map((tool) => tool.name), ['list_runs', 'get_run', 'get_rules']);
  for (const tool of TOOL_DEFINITIONS) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  }
});

test('list/get/rules return public evidence and keep injected text inert and bytes unchanged', async (t) => {
  const record = syntheticRun({ seed: 'tools-injection', injection: true });
  const { service, file, hash } = await fixture(t, record);
  const listed = payload(await service.call('list_runs', { limit: 5 }));
  assert.equal(listed.count, 1);
  assert.equal(listed.runs[0].runId, record.runId);

  const runResult = await service.call('get_run', { run_id: record.runId, detail: 'full' });
  assertTextBound(runResult);
  const run = payload(runResult);
  assert.equal(run.record.ending.text, record.ending.text);
  assert.match(run.analysisGuide.untrustedDataNotice, /不可信/);
  assert.equal(run.record.knowledgeBoundary.hiddenTerminalTruthIncluded, false);
  assert.doesNotMatch(JSON.stringify(run), /functionState|eventDecisions|"seed"/);

  const rules = payload(await service.call('get_rules', {}));
  assert.equal(rules.gameSchemaVersion, 'ai-engineer-game.run.v1');
  assert.match(rules.knowledgeBoundary, /不提供事件權重/);
  assert.deepEqual(Object.keys(rules.publicRulesByCase).sort(), ['case-01', 'case-02', 'case-03', 'case-04']);
  assert.match(rules.publicRules.branching, /案件 01 @3/);
  assert.deepEqual(rules.publicRulesByCase['case-01'].ruleVersions['case-01-narrative@2'].branchActions, []);
  assert.deepEqual(rules.publicRulesByCase['case-01'].ruleVersions['case-01-narrative@3'].branchActions, ['A13', 'A14']);
  assert.equal(rules.publicRulesByCase['case-01'].ruleVersions['case-01-narrative@3'].delayedConsequenceAfterMeaningfulWork, 2);
  const case04Rules = rules.publicRulesByCase['case-04'].ruleVersions['case-04-legacy@1'];
  assert.deepEqual(case04Rules.strategies, ['patch', 'investigate', 'refactor', 'rollback']);
  assert.equal(case04Rules.rollbackCompatibilityDecisionRequired, true);
  assert.equal(case04Rules.scopeApproval.agentMayApprove, false);
  assert.deepEqual(case04Rules.scopeApproval.responses, ['approved', 'changes-requested']);
  assert.equal(sha256(await fs.readFile(file)), hash, 'read-only calls must not mutate fixture');
});

for (const record of [syntheticCase02Run(), syntheticCase03Run(), syntheticCase04Run()]) {
  test(`MCP lists and reads ${record.caseId} without changing the record`, async (t) => {
    const { service, file, hash } = await fixture(t, record);
    const listed = payload(await service.call('list_runs', {}));
    assert.equal(listed.runs[0].runId, record.runId);
    assert.equal(listed.runs[0].caseId, record.caseId);
    const read = payload(await service.call('get_run', { run_id: record.runId, detail: 'full' }));
    assert.equal(read.record.gameRuleVersion, record.gameRuleVersion);
    assert.equal(read.record.timeline.at(-1).kind, 'delivery');
    assert.equal(sha256(await fs.readFile(file)), hash);
  });
}

test('known-tool data failures use isError while invalid arguments throw parameter errors', async (t) => {
  const { service } = await fixture(t, syntheticRun({ seed: 'tools-errors' }));
  const missing = await service.call('get_run', { run_id: 'case01-deadbeef' });
  assert.equal(missing.isError, true);
  assert.equal(payload(missing).error.code, 'run_not_found');
  const attack = await service.call('get_run', { run_id: '../secret' });
  assert.equal(attack.isError, true);
  assert.equal(payload(attack).error.code, 'invalid_run_id');
  await assert.rejects(service.call('list_runs', { limit: 99 }), /limit/);
});

test('large valid full result is structurally truncated, not silently string-cut', async (t) => {
  const record = syntheticRun({ seed: 'tools-truncate' });
  const source = record.timeline[0];
  record.timeline = Array.from({ length: 24 }, (_, index) => ({
    ...structuredClone(source), sequence: index + 1,
    observedOutcome: { ...structuredClone(source.observedOutcome), process: { player: '甲'.repeat(400), response: '乙'.repeat(400), followUp: '丙'.repeat(400), consequence: '丁'.repeat(400) } },
  }));
  const { service } = await fixture(t, record);
  const result = await service.call('get_run', { run_id: record.runId, detail: 'full' });
  assertTextBound(result);
  const output = payload(result);
  assert.equal(output.truncated, true);
  assert.equal(output.omittedDetail, 'process');
});

test('every final tool content text is bounded and unknown I/O errors redact filesystem paths', async () => {
  const privatePath = 'C:\\Users\\PrivateName\\secret-runs';
  const service = createToolService({
    async list() { throw new Error(`EACCES: permission denied, scandir ${privatePath}`); },
    async get() { throw new Error(`EACCES: permission denied, open ${privatePath}\\private.json`); },
  });
  for (const [name, args] of [['list_runs', {}], ['get_run', { run_id: 'case01-deadbeef' }]]) {
    const result = await service.call(name, args);
    assert.equal(result.isError, true);
    assertTextBound(result);
    assert.doesNotMatch(result.content[0].text, /PrivateName|secret-runs|EACCES/);
    assert.equal(payload(result).error.code, 'data_error');
  }
});

test('generic successful list output also degrades to a bounded structured result', async () => {
  const records = Array.from({ length: 50 }, (_, index) => {
    const record = syntheticRun({ seed: `large-list-${index}` });
    record.runId = `case01-large-list-${String(index).padStart(2, '0')}`;
    record.character.name = '角'.repeat(240);
    record.character.difficulty = '難'.repeat(240);
    record.ending.title = '局'.repeat(240);
    return record;
  });
  const service = createToolService({ async list() { return records; }, async get() { return records[0]; } });
  const result = await service.call('list_runs', { limit: 50 });
  assert.equal(result.isError, false);
  assertTextBound(result);
  const output = payload(result);
  assert.equal(output.truncated, true);
  assert.match(output.message, /安全輸出上限/);
});
