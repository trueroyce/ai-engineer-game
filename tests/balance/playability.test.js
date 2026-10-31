import test from 'node:test';
import assert from 'node:assert/strict';

import { openingChoices, createNarrativeGame } from '../../src/narrative/engine.js';
import { createCase02Game, previewCase02Action } from '../../src/case-02/engine-v2.js';
import { createCase03Game } from '../../src/case-03/engine.js';
import {
  case04PublicView,
  chooseCase04Reward,
  createCase04Game,
  performCase04Action,
  previewCase04Action,
} from '../../src/case-04/engine.js';

test('balance resources distinguish robust warrior and guided beginner without accumulated career advantages', () => {
  const seed = 'balance-resource-check';
  const selected = openingChoices(seed)[0];
  const case01Ultimate = createNarrativeGame({ seed, templateId: 'ultimate', selectedCards: [selected] });
  const case01Beginner = createNarrativeGame({ seed, templateId: 'beginner', selectedCards: [selected] });
  assert.deepEqual([case01Ultimate.token, case01Ultimate.timeLeft], [24, 12]);
  assert.deepEqual([case01Beginner.token, case01Beginner.timeLeft], [28, 14]);

  const case02Ultimate = createCase02Game({ templateId: 'ultimate', progressionV2: true, seed: 7 });
  const case02Beginner = createCase02Game({ templateId: 'beginner', progressionV2: true, seed: 7 });
  assert.deepEqual([case02Ultimate.token, case02Ultimate.timeLeft], [21, 13]);
  assert.deepEqual([case02Beginner.token, case02Beginner.timeLeft], [22, 14]);

  const case03Ultimate = createCase03Game({ templateId: 'ultimate', progressionV2: true, seed: 7 });
  const case03Beginner = createCase03Game({ templateId: 'beginner', progressionV2: true, seed: 7 });
  assert.deepEqual([case03Ultimate.token, case03Ultimate.timeLeft], [23, 15]);
  assert.deepEqual([case03Beginner.token, case03Beginner.timeLeft], [22, 14]);

  const case04Ultimate = createCase04Game({ templateId: 'ultimate', seed: 7 });
  const case04Beginner = createCase04Game({ templateId: 'beginner', seed: 7 });
  assert.deepEqual([case04Ultimate.token, case04Ultimate.timeLeft], [21, 13]);
  assert.deepEqual([case04Beginner.token, case04Beginner.timeLeft], [22, 14]);
  for (const state of [case02Ultimate, case02Beginner, case03Ultimate, case03Beginner, case04Ultimate, case04Beginner]) {
    assert.deepEqual(state.cards, {});
    assert.deepEqual(state.equipped, []);
  }
});

test('career attempts disclose bounded template modifiers while direct legacy probability probes remain unchanged', () => {
  const beginner = createCase02Game({ templateId: 'beginner', progressionV2: true, seed: 9 });
  const beginnerPreview = previewCase02Action(beginner, 'B01', {});
  assert.ok(beginnerPreview.attempt.modifiers.some((item) => item.id === 'beginner-guidance' && item.value === 30));

  const ultimate = createCase02Game({ templateId: 'ultimate', progressionV2: true, seed: 9 });
  const ultimatePreview = previewCase02Action(ultimate, 'B01', {});
  assert.ok(ultimatePreview.attempt.modifiers.some((item) => item.id === 'ultimate-focus' && item.value === 5));

  const direct = createCase02Game({ templateId: 'beginner', progressionV2: false, seed: 9 });
  assert.ok(!previewCase02Action(direct, 'B01', {}).attempt.modifiers.some((item) => item.id === 'beginner-guidance'));
});

function case04Harness(templateId = 'ultimate') {
  let state = createCase04Game({ templateId, eventRolls: Array(64).fill(1) });
  let operation = 0;
  const act = (actionId, options = {}) => {
    const output = performCase04Action(state, actionId, {
      ...options,
      operationId: `balance-case04-${++operation}`,
      stateVersion: state.stateVersion,
    });
    state = output.state;
    while (state.pendingReward) state = chooseCase04Reward(state, state.pendingReward.choices[0]).state;
    return output.result;
  };
  return { act, get state() { return state; } };
}

function reachCase04Commitment(harness, route = 'freeze') {
  harness.act('D01', { method: 'logs' });
  harness.act('D02', { strategy: 'investigate' });
  harness.act('D03', { agentMode: 'sequential' });
  harness.act('D04', { route });
  harness.act('D05', { cause: 'code' });
}

test('focused Case 04 evidence can be expanded through the normal action with an honest retry cost', () => {
  const harness = case04Harness();
  reachCase04Commitment(harness);
  harness.act('D07', { scope: 'focused' });
  assert.equal(harness.state.evidence.coverage, 2);
  assert.ok(case04PublicView(harness.state).availableActions.includes('D07'));

  const preview = previewCase04Action(harness.state, 'D07', { scope: 'full' });
  const before = { token: harness.state.token, time: harness.state.timeLeft };
  harness.act('D07', { scope: 'full' });
  assert.equal(harness.state.evidence.coverage, 4);
  assert.equal(before.token - harness.state.token, preview.token);
  assert.equal(before.time - harness.state.timeLeft, preview.time);
});

test('Case 04 improve route closes extra work only through repair, then requires fresh evidence and approval', () => {
  const harness = case04Harness();
  reachCase04Commitment(harness, 'improve');
  harness.act('D07', { scope: 'full' });
  assert.equal(harness.state.issues.find((item) => item.id === 'extra-change')?.status, 'open');
  assert.equal(harness.state.story.pendingConsequence.revealed, true);

  harness.act('D06', { response: 'repair' });
  assert.equal(harness.state.issues.find((item) => item.id === 'extra-change')?.status, 'resolved');
  assert.equal(harness.state.story.pendingConsequence.resolved, true);
  assert.equal(harness.state.evidence.revision, null, 'repair advances revision and invalidates old evidence');
  assert.equal(harness.state.approval.status, 'pending');

  harness.act('D07', { scope: 'full' });
  harness.act('D08', { depth: 'complete' });
  harness.act('D11', { proposal: 'verified' });
  assert.equal(harness.state.approval.status, 'approved');
  harness.act('D09', { intent: 'verified' });
  assert.equal(harness.state.ending.baseId, 'C04-VERIFIED');
});
