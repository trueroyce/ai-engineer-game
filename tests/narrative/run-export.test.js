import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseUpgrade, createNarrativeGame, performAction, rest, upgradeChoices } from '../../src/narrative/engine.js';
import { buildRunRecord, serializeRunRecord } from '../../src/postgame/run-export.js';
import { RUN_SCHEMA_VERSION, RunValidationError, validateRunRecord } from '../../src/postgame/run-schema.js';

function stopAfterOneResult({ event = 'A01-B' } = {}) {
  let state = createNarrativeGame({ seed: 'export-normal', templateId: 'balanced' });
  state.functionState.R3 = 'defective'; // 未揭露的內部真相，不可出現在匯出。
  let out = performAction(state, 'A01', { operationId: 'export-a01', stateVersion: state.stateVersion, designate: event });
  state = out.state;
  out = performAction(state, 'A12', { operationId: 'export-stop', stateVersion: state.stateVersion, intent: 'stop' });
  return out.state;
}

test('ended game exports a validated player-visible-only v1 record', () => {
  const state = stopAfterOneResult();
  const before = JSON.stringify(state);
  const first = buildRunRecord(state);
  const second = buildRunRecord(state);

  assert.equal(first.schemaVersion, RUN_SCHEMA_VERSION);
  assert.match(first.runId, /^case01-[a-f0-9]{16}$/);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(state), before, 'export must not mutate state');
  assert.equal(first.knowledgeBoundary.playerVisibleOnly, true);
  assert.equal(first.knowledgeBoundary.hiddenTerminalTruthIncluded, false);
  assert.deepEqual(first.timeline.map((item) => item.kind), ['work', 'delivery']);
  assert.equal(first.timeline[0].decision.actionKey, 'A01');
  assert.ok(first.timeline[0].observedOutcome.title);
  assert.equal(first.timeline[0].resourceCost.token, 2);

  const text = serializeRunRecord(first);
  for (const forbidden of ['"seed"', 'functionState', 'eventDecisions', 'operationResults', 'duplicate-delete', '"abilities"']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.doesNotThrow(() => validateRunRecord(JSON.parse(text)));
});

test('export refuses an in-progress game instead of falling back to raw state', () => {
  const state = createNarrativeGame({ seed: 'export-playing' });
  assert.throws(() => buildRunRecord(state), /只有已結束/);
});

test('public strings are bounded and marked without admitting extra state fields', () => {
  const state = stopAfterOneResult();
  const result = Object.values(state.resolved)[0];
  result.event.summary = `公開說明：${'長'.repeat(9_000)}`;
  const record = buildRunRecord(state);
  assert.match(record.timeline[0].observedOutcome.summary, /…\[截斷\]$/);
  assert.ok(record.timeline[0].observedOutcome.summary.length <= 2_400);
  assert.doesNotThrow(() => validateRunRecord(record));
});

test('rest, upgrade and delivery are separate public decisions with resource snapshots', () => {
  let state = createNarrativeGame({ seed: 'export-nonwork', templateId: 'ultimate' });
  state = rest(state, { operationId: 'export-rest', stateVersion: state.stateVersion }).state;
  state.pendingUpgrades = [2];
  state = chooseUpgrade(state, upgradeChoices(state)[0]);
  state = performAction(state, 'A12', { operationId: 'export-end', stateVersion: state.stateVersion, intent: 'stop' }).state;
  const record = buildRunRecord(state);

  assert.deepEqual(record.timeline.map((item) => item.kind), ['rest', 'upgrade', 'delivery']);
  assert.equal(record.timeline[0].resourceCost.workTime, 1);
  assert.equal(record.timeline[1].resourceCost.workTime, 0);
  assert.equal(record.timeline[2].decision.choices.intent, 'stop');
  assert.equal(record.timeline.every((item) => Number.isInteger(item.resourcesAfter.workCount)), true);
});

test('schema rejects unknown fields and unsupported schema or rule versions', () => {
  const record = buildRunRecord(stopAfterOneResult());
  assert.throws(() => validateRunRecord({ ...record, secret: 'nope' }), RunValidationError);
  assert.throws(() => validateRunRecord({ ...record, schemaVersion: 'ai-engineer-game.run.v9' }), (error) => error.code === 'unsupported_schema');
  assert.throws(() => validateRunRecord({ ...record, gameRuleVersion: 'case-99' }), (error) => error.code === 'unsupported_rule_version');
});
