import test from 'node:test';
import assert from 'node:assert/strict';

import { availableActions, chooseUpgrade, composeEnding, createNarrativeGame, performAction, upgradeChoices } from '../../src/narrative/engine.js';

function act(state, actionId, options = {}) {
  let next = performAction(state, actionId, { ...options, operationId: `${actionId}-${state.stateVersion}-${options.route ?? options.designate ?? 'work'}`, stateVersion: state.stateVersion }).state;
  while (next.pendingUpgrades.length) next = chooseUpgrade(next, upgradeChoices(next)[0]);
  return next;
}

function reachImplementation(eventId = 'A07-A') {
  let state = createNarrativeGame({ seed: `phase31-case01-${eventId}`, templateId: 'balanced' });
  state = act(state, 'A01', { designate: 'A01-A' });
  state = act(state, 'A04', { designate: 'A04-A' });
  state = act(state, 'A05', { designate: 'A05-A' });
  state = act(state, 'A07', { target: 'core', designate: eventId });
  return state;
}

test('case 01 success opens a real steady/expand decision with different legal work', () => {
  const atDecision = reachImplementation('A07-A');
  assert.ok(availableActions(atDecision).includes('A13'));
  const steady = act(atDecision, 'A13', { route: 'steady' });
  const expand = act(atDecision, 'A13', { route: 'expand' });
  assert.equal(steady.story.commitment, 'steady');
  assert.equal(steady.requirement.scope, 'bounded');
  assert.equal(availableActions(steady).includes('A03'), false);
  assert.equal(expand.story.commitment, 'expand');
  assert.equal(expand.requirement.scope, 'pending_change');
  assert.equal(availableActions(expand).includes('A03'), true);
  assert.ok(expand.knownIssues.some((item) => item.code === 'phase31-extra-scope' && item.status !== 'fixed'));
});

test('case 01 failure opens prototype/trim/force recovery instead of another identical roll', () => {
  const atDecision = reachImplementation('A07-C');
  assert.ok(availableActions(atDecision).includes('A13'));
  const prototype = act(atDecision, 'A13', { route: 'prototype' });
  const trim = act(atDecision, 'A13', { route: 'trim' });
  const force = act(atDecision, 'A13', { route: 'force' });
  assert.equal(prototype.artifact.kind, 'prototype');
  assert.equal(trim.scopeNegotiated, true);
  assert.ok(force.knownIssues.some((item) => item.code === 'phase31-forced-scope' && item.status !== 'fixed'));
  assert.notDeepEqual(prototype.story.history, force.story.history);
});

test('case 01 named consequence survives two later works and changes the available action set', () => {
  let state = act(reachImplementation('A07-A'), 'A13', { route: 'expand' });
  assert.equal(availableActions(state).includes('A14'), false);
  state = act(state, 'A09', { designate: 'A09-B' });
  assert.equal(state.story.followUpWork, 1);
  state = act(state, 'A08');
  assert.equal(state.story.followUpWork, 2);
  assert.equal(availableActions(state).includes('A14'), true);
  state = act(state, 'A14', { route: 'cut-back' });
  assert.equal(state.story.pendingConsequence.resolved, true);
  assert.equal(availableActions(state).includes('A14'), false);
  assert.equal(state.knownIssues.find((item) => item.code === 'phase31-extra-scope').status, 'fixed');
});

test('case 01 route decision is idempotent and ending keeps delivery truth plus route story', () => {
  const before = reachImplementation('A07-A');
  const request = { route: 'steady', operationId: 'steady-once', stateVersion: before.stateVersion };
  const first = performAction(before, 'A13', request);
  const replay = performAction(first.state, 'A13', request);
  assert.equal(replay.cached, true);
  assert.equal(replay.state.token, first.state.token);
  assert.equal(replay.state.story.history.length, 1);
  const ending = composeEnding(first.state, 'E08');
  assert.equal(ending.baseId, 'E08');
  assert.ok(ending.facets.includes('implementation-core'));
  assert.ok(ending.facets.includes('route-steady'));
  assert.match(ending.text, /穩住|已驗證範圍/);
});
