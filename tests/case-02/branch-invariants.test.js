import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCase02Reward, createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { case02OpportunityChoices, case02RecoveryChoices } from '../../src/case-02/story.js';

const aligned = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };
function act(state, actionId, options = {}) {
  return performCase02Action(state, actionId, {
    ...options,
    operationId: `${actionId}-${state.stateVersion}`,
    stateVersion: state.stateVersion,
  }).state;
}

test('story choices do not create extra EXP slots', () => {
  let state = createCase02Game({ templateId: 'beginner', eventRolls: [100, 1], progressionV2: true });
  state = act(state, 'B01', aligned);
  const before = { runExp: state.progression.runExp, keys: [...state.progression.progressKeys] };
  state = act(state, 'B10', { route: 'prototype' });
  assert.equal(state.progression.runExp, before.runExp);
  assert.deepEqual(state.progression.progressKeys, before.keys);
});

test('mapping repair does not erase deleted rows or an unrelated verbal change', () => {
  let state = createCase02Game({ templateId: 'ultimate', eventRolls: Array(10).fill(1) });
  state = act(state, 'B01', aligned);
  state = act(state, 'B02', { strategy: 'solo', useRapid: false });
  state = act(state, 'B03', { useFastMerge: false });
  state = chooseCase02Reward(state, state.pendingReward.choices[0]).state;
  state = act(state, 'B04', { response: 'patch' });
  state.token = 18;
  state.timeLeft = 12;
  state = act(state, 'B05', { mode: 'delete' });
  assert.equal(state.story.commitments.deletedRows, 'pending');
  assert.equal(state.story.commitments.verbalChange, 'pending');
  state = act(state, 'B05', { mode: 'repair' });
  assert.equal(state.story.commitments.deletedRows, 'pending');
  assert.equal(state.story.commitments.verbalChange, 'pending');
  assert.equal(state.destructiveCleanup, true);
  assert.equal(state.change.contractUpdated, false);
});

test('failed repair and verification do not clear delayed commitments', () => {
  let repairState = createCase02Game({ templateId: 'ultimate', eventRolls: [1, 1, 1, 100] });
  repairState = act(repairState, 'B01', aligned);
  repairState = act(repairState, 'B02', { strategy: 'two', useRapid: false });
  repairState = act(repairState, 'B03', { useFastMerge: false });
  repairState = chooseCase02Reward(repairState, repairState.pendingReward.choices[0]).state;
  assert.equal(repairState.story.commitments.parallelSchemaDrift, 'surfaced');
  repairState = act(repairState, 'B05', { mode: 'repair' });
  assert.equal(repairState.lastAttempt.outcome, 'failure');
  assert.equal(repairState.story.commitments.parallelSchemaDrift, 'surfaced');

  let testState = createCase02Game({ templateId: 'ultimate', eventRolls: [1, 1, 1, 100] });
  testState = act(testState, 'B01', aligned);
  testState = act(testState, 'B02', { strategy: 'solo', useRapid: false });
  testState = act(testState, 'B03', { useFastMerge: false });
  testState = chooseCase02Reward(testState, testState.pendingReward.choices[0]).state;
  testState = act(testState, 'B11', { route: 'gamble' });
  assert.equal(testState.story.commitments.extraSource, 'pending');
  testState = act(testState, 'B06', { scope: 'full' });
  assert.equal(testState.lastAttempt.outcome, 'failure');
  assert.equal(testState.story.commitments.extraSource, 'pending');

  let traceState = createCase02Game({ templateId: 'ultimate', eventRolls: [1, 1, 1, 100] });
  traceState = act(traceState, 'B01', aligned);
  traceState = act(traceState, 'B02', { strategy: 'solo', useRapid: false });
  traceState = act(traceState, 'B03', { useFastMerge: false });
  traceState = chooseCase02Reward(traceState, traceState.pendingReward.choices[0]).state;
  traceState = act(traceState, 'B11', { route: 'gamble' });
  traceState = act(traceState, 'B07');
  assert.equal(traceState.lastAttempt.outcome, 'failure');
  assert.equal(traceState.story.commitments.extraSource, 'pending');
});

test('existing cards open semantic routes while cardless recovery remains available', () => {
  const cardless = createCase02Game({ templateId: 'balanced' });
  cardless.story.openRecovery = { sourceAction: 'B01' };
  assert.deepEqual(case02RecoveryChoices(cardless).map((item) => item.id), ['prototype', 'trim', 'force']);

  const negotiation = createCase02Game({ templateId: 'balanced', cards: { C8: 1 }, equipped: ['C8'] });
  negotiation.story.openRecovery = { sourceAction: 'B01' };
  assert.equal(case02RecoveryChoices(negotiation).some((item) => item.cardId === 'C8'), true);

  const exchange = createCase02Game({ templateId: 'balanced', cards: { C5: 1 }, equipped: ['C5'] });
  exchange.story.openOpportunity = { sourceAction: 'B03' };
  assert.equal(case02OpportunityChoices(exchange).some((item) => item.id === 'card-exchange'), true);
});

test('C10 exchange after integration records debt in the active integration ledger', () => {
  let state = createCase02Game({ templateId: 'balanced', cards: { C10: 1 }, equipped: ['C10'], progressionV2: true });
  state.integration = { complete: true, unresolvedDebt: 0 };
  state.story.openOpportunity = { sourceAction: 'B03' };
  const beforeExp = state.progression.runExp;

  state = act(state, 'B11', { route: 'card-exchange' });

  assert.equal(state.integration.unresolvedDebt, 1);
  assert.equal(state.preIntegrationDebt, 0);
  assert.equal(state.progression.runExp, beforeExp);
});
