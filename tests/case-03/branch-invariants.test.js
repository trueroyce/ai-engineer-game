import test from 'node:test';
import assert from 'node:assert/strict';

import { createCase03Game, performCase03Action } from '../../src/case-03/engine.js';
import { case03OpportunityChoices, case03RecoveryChoices } from '../../src/case-03/story.js';

function act(state, actionId, options = {}) {
  return performCase03Action(state, actionId, {
    ...options,
    operationId: `${actionId}-${state.stateVersion}`,
    stateVersion: state.stateVersion,
  }).state;
}

test('story choices do not create extra EXP slots', () => {
  let state = createCase03Game({ templateId: 'beginner', eventRolls: [100, 1], progressionV2: true });
  state = act(state, 'C01', { scope: 'full' });
  const before = { runExp: state.progression.runExp, keys: [...state.progression.progressKeys] };
  state = act(state, 'C09', { route: 'prototype' });
  assert.equal(state.progression.runExp, before.runExp);
  assert.deepEqual(state.progression.progressKeys, before.keys);
});

test('case 03 exposes card negotiation and resource exchange without removing no-card options', () => {
  const cardless = createCase03Game({ templateId: 'balanced' });
  cardless.story.openRecovery = { sourceAction: 'C01' };
  assert.deepEqual(case03RecoveryChoices(cardless).map((item) => item.id), ['prototype', 'trim', 'force']);

  const negotiation = createCase03Game({ templateId: 'balanced', cards: { C11: 1 }, equipped: ['C11'] });
  negotiation.story.openRecovery = { sourceAction: 'C01' };
  assert.equal(case03RecoveryChoices(negotiation).some((item) => item.cardId === 'C11'), true);

  const exchange = createCase03Game({ templateId: 'balanced', cards: { C10: 1 }, equipped: ['C10'] });
  exchange.story.openOpportunity = { sourceAction: 'C03' };
  assert.equal(case03OpportunityChoices(exchange).some((item) => item.id === 'card-exchange'), true);
});

test('C10 exchange creates a visible coordination debt that the adapter route can repay', () => {
  let state = createCase03Game({ templateId: 'balanced', cards: { C10: 1 }, equipped: ['C10'], progressionV2: true });
  state.story.openOpportunity = { sourceAction: 'C03' };
  const beforeExp = state.progression.runExp;

  state = act(state, 'C10', { route: 'card-exchange' });
  assert.equal(state.integrationDebt, 1);
  assert.equal(state.story.commitments.fastMerge, 'surfaced');
  assert.equal(state.story.issues.find((item) => item.id === 'coordination-debt')?.status, 'open');
  assert.equal(state.progression.runExp, beforeExp);

  state.token = Math.max(state.token, 2);
  state.timeLeft = Math.max(state.timeLeft, 1);
  state = act(state, 'C11', { route: 'adapter' });
  assert.equal(state.integrationDebt, 0);
  assert.equal(state.story.commitments.fastMerge, 'resolved');
  assert.equal(state.story.issues.find((item) => item.id === 'coordination-debt')?.status, 'resolved');
});
