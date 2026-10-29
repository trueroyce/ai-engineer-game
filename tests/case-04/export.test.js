import test from 'node:test';
import assert from 'node:assert/strict';
import { syntheticCase04Run } from '../mcp/fixtures.js';
import { validateRunRecord } from '../../src/postgame/run-schema.js';
import { buildCareerCaseRunRecord } from '../../src/postgame/career-run-export.js';
import { chooseCase04Reward, createCase04Game, performCase04Action } from '../../src/case-04/engine.js';

function take(state, actionId, options = {}) {
  let next = performCase04Action(state, actionId, { ...options, operationId: `export-${actionId}-${state.stateVersion}`, stateVersion: state.stateVersion }).state;
  while (next.pendingReward) next = chooseCase04Reward(next, next.pendingReward.choices[0]).state;
  return next;
}

test('case 04 exports a validated deterministic public-only run', () => {
  const record = syntheticCase04Run();
  assert.equal(record.caseId, 'case-04');
  assert.equal(record.gameRuleVersion, 'case-04-legacy@1');
  assert.match(record.runId, /^case04-[a-f0-9]{16}$/);
  assert.equal(record.ending.baseId, 'C04-VERIFIED');
  assert.equal(record.timeline.at(-1).kind, 'delivery');
  assert.equal(record.timeline.find((item) => item.decision.actionKey === 'D01').decision.choices.method, 'reproduce');
  assert.equal(record.timeline.find((item) => item.decision.actionKey === 'D03').decision.choices.agentMode, 'sequential');
  assert.equal(record.timeline.find((item) => item.decision.actionKey === 'D05').decision.choices.cause, 'code');
  assert.equal(record.timeline.find((item) => item.decision.actionKey === 'D08').decision.choices.depth, 'complete');
  assert.equal(record.timeline.find((item) => item.decision.actionKey === 'D11').decision.choices.proposal, 'verified');
  assert.match(record.publicProgress.documentText, /客戶／產品負責人/);
  assert.doesNotThrow(() => validateRunRecord(record));
  const text = JSON.stringify(record);
  for (const forbidden of ['"seed"', 'operationResults', 'eventWeights', 'eventDecisions', 'rng']) assert.equal(text.includes(forbidden), false, forbidden);
});

test('case 04 exports a responsible-person rejection and its public reasons', () => {
  let state = createCase04Game({ templateId: 'balanced', eventRolls: Array(20).fill(1), progressionV2: true });
  state = take(state, 'D01', { method: 'reproduce' });
  state = take(state, 'D02', { strategy: 'patch' });
  state = take(state, 'D03', { agentMode: 'sequential' });
  state = take(state, 'D04', { route: 'freeze' });
  state = take(state, 'D11', { proposal: 'verified' });
  assert.equal(state.approval.status, 'changes-requested');
  state = take(state, 'D09', { intent: 'risk' });
  const record = buildCareerCaseRunRecord(state);
  const decision = record.timeline.find((item) => item.decision.actionKey === 'D11');
  assert.match(decision.observedOutcome.title, /退回/);
  assert.match(decision.observedOutcome.summary, /根因|證據/);
  assert.match(record.publicProgress.documentText, /負責人退回/);
  assert.doesNotThrow(() => validateRunRecord(record));
});
