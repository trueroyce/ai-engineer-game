import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCase02Reward, createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { chooseCase03Reward, createCase03Game, performCase03Action } from '../../src/case-03/engine.js';
import { buildCareerCaseRunRecord } from '../../src/postgame/career-run-export.js';
import { validateRunRecord } from '../../src/postgame/run-schema.js';

function case02Action(state, actionId, options = {}) {
  let next = performCase02Action(state, actionId, {
    ...options, operationId: `export-${actionId}-${state.stateVersion}`, stateVersion: state.stateVersion,
  }).state;
  if (next.pendingReward) next = chooseCase02Reward(next, next.pendingReward.choices[0]).state;
  return next;
}

function completedCase02() {
  let state = createCase02Game({ templateId: 'balanced', eventRolls: Array(24).fill(1) });
  state = case02Action(state, 'B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' });
  state = case02Action(state, 'B02', { strategy: 'solo', useRapid: false });
  state = case02Action(state, 'B03');
  state = case02Action(state, 'B04', { response: 'contract' });
  state = case02Action(state, 'B07');
  state = case02Action(state, 'B06', { scope: 'full' });
  return case02Action(state, 'B09', { intent: 'verified' });
}

function case03Action(state, actionId, options = {}) {
  let next = performCase03Action(state, actionId, {
    ...options, operationId: `export-${actionId}-${state.stateVersion}`, stateVersion: state.stateVersion,
  }).state;
  if (next.pendingReward) next = chooseCase03Reward(next, next.pendingReward.choices[0]).state;
  return next;
}

function completedCase03() {
  let state = createCase03Game({ templateId: 'balanced', eventRolls: Array(24).fill(1) });
  state = case03Action(state, 'C01', { scope: 'full' });
  state = case03Action(state, 'C02', { policy: 'explicit' });
  state = case03Action(state, 'C03', { strategy: 'pair' });
  state = case03Action(state, 'C04', { mergeMode: 'strict' });
  state = case03Action(state, 'C05', { response: 'negotiate' });
  state = case03Action(state, 'C06', { scope: 'full' });
  return case03Action(state, 'C07', { intent: 'verified' });
}

for (const [caseId, createState, prefix, ruleVersion] of [
  ['case-02', completedCase02, 'case02-', 'case-02-csv@2'],
  ['case-03', completedCase03, 'case03-', 'case-03-booking@1'],
]) {
  test(`${caseId} exports a deterministic validated public-only run`, () => {
    const state = createState();
    const before = structuredClone(state);
    const first = buildCareerCaseRunRecord(state);
    const second = buildCareerCaseRunRecord(state);
    assert.deepEqual(state, before, 'export must not mutate the ended game');
    assert.deepEqual(first, second);
    assert.equal(first.runId.startsWith(prefix), true);
    assert.equal(first.caseId, caseId);
    assert.equal(first.gameRuleVersion, ruleVersion);
    assert.equal(first.timeline.at(-1).kind, 'delivery');
    assert.equal(first.timeline.some((item) => item.observedOutcome.process?.player), true);
    assert.equal(first.knowledgeBoundary.playerVisibleOnly, true);
    assert.equal(first.knowledgeBoundary.hiddenTerminalTruthIncluded, false);
    assert.equal(validateRunRecord(first), first);
    const json = JSON.stringify(first);
    for (const hidden of ['"seed"', '"rng"', 'eventAudit', 'operationResults', 'operationPayloads', 'eventRolls', 'rewardDraws', '"abilities"']) {
      assert.equal(json.includes(hidden), false, hidden);
    }
  });
}

test('export refuses active games and the schema refuses a mismatched case/rule pair', () => {
  assert.throws(() => buildCareerCaseRunRecord(createCase02Game({ templateId: 'balanced' })), /已結案/);
  const record = buildCareerCaseRunRecord(completedCase02());
  record.gameRuleVersion = 'case-03-booking@1';
  assert.throws(() => validateRunRecord(record), /do not match/);
});
