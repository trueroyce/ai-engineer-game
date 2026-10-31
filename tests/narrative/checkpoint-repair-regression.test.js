import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableActions,
  createNarrativeGame,
  performAction,
  previewAction,
  readPreviousActionResult,
} from '../../src/narrative/engine.js';
import { actionOptionsForNewWork, projectNarrativeView } from '../../src/narrative/view.js';

function act(state, actionId, options = {}) {
  return performAction(state, actionId, {
    ...options,
    operationId: `checkpoint-${state.stateVersion}-${actionId}`,
    stateVersion: state.stateVersion,
  });
}

function stateAfterConsumedCheckpoint() {
  let state = createNarrativeGame({ seed: 'checkpoint-repair-regression', templateId: 'beginner', selectedCards: ['C6'] });
  state = act(state, 'A05', { designate: 'A05-B' }).state;
  state = act(state, 'A11', { designate: 'A11-B', mode: 'fix' }).state;
  state = act(state, 'A11', { designate: 'A11-C', mode: 'rollback' }).state;
  state = act(state, 'A06', { designate: 'A06-A' }).state;
  return state;
}

test('checkpoint rollback keeps the restored issue repairable instead of replaying a stale rollback mode', () => {
  const state = stateAfterConsumedCheckpoint();
  const openBefore = state.knownIssues.filter((issue) => issue.status !== 'fixed');
  const previous = readPreviousActionResult(state, 'A11');
  const view = projectNarrativeView(state);

  assert.equal(state.checkpoint, null);
  assert.equal(state.rollbackAvailable, false);
  assert.equal(openBefore.length, 1);
  assert.equal(previous.semanticOptions.mode, 'rollback');
  assert.ok(availableActions(state).includes('A11'));
  assert.ok(view.primaryActions.some((action) => action.id === 'A11' && action.canStart));
  assert.equal(view.revisionOptions.canFixIssue, true);
  assert.equal(view.revisionOptions.canRollback, false);

  const options = actionOptionsForNewWork(state, 'A11');
  assert.deepEqual(options, { mode: 'fix' });
  assert.deepEqual(previewAction(state, 'A11', options), { cached: false, cost: 2, overtime: false });

  const repeatedAttempt = act(state, 'A11', { ...options, designate: 'A11-A' });
  assert.equal(repeatedAttempt.result.type, 'event');
  assert.equal(repeatedAttempt.result.event.id, 'A11-B', 'rollback reuses the sampled repair outcome instead of granting a free reroll');
  assert.equal(repeatedAttempt.state.workCount, state.workCount + 1);
  assert.equal(repeatedAttempt.state.token, state.token - 2);
  assert.equal(repeatedAttempt.state.knownIssues.some((issue) => issue.status !== 'fixed'), true);
  assert.equal(projectNarrativeView(repeatedAttempt.state).revisionOptions.canRepairNextIssue, true);

  const repaired = act(repeatedAttempt.state, 'A11', { mode: 'fix', repairDraft: true, designate: 'A11-A' });
  assert.equal(repaired.result.type, 'event');
  assert.equal(repaired.result.event.id, 'A11-A');
  assert.equal(repaired.state.workCount, state.workCount + 2);
  assert.equal(repaired.state.token, state.token - 4);
  assert.equal(repaired.state.knownIssues.some((issue) => issue.status !== 'fixed'), false);
});

test('A11 defaults only to a currently legal subject and rejects explicit stale modes', () => {
  const state = stateAfterConsumedCheckpoint();
  assert.throws(
    () => act(state, 'A11', { mode: 'rollback', designate: 'A11-C' }),
    /指定事件不合法/,
  );

  const noIssue = structuredClone(state);
  noIssue.knownIssues.forEach((issue) => { issue.status = 'fixed'; });
  noIssue.checkpoint = {
    artifact: structuredClone(noIssue.artifact),
    functionState: structuredClone(noIssue.functionState),
    evidence: structuredClone(noIssue.evidence),
    knownIssues: structuredClone(noIssue.knownIssues),
    sourceActionId: 'A05',
  };
  noIssue.rollbackAvailable = true;
  assert.deepEqual(actionOptionsForNewWork(noIssue, 'A11'), { mode: 'rollback' });
  assert.ok(availableActions(noIssue).includes('A11'));
});
