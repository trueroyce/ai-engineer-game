import test from 'node:test';
import assert from 'node:assert/strict';

import { case02PublicView, createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { case03PublicView, createCase03Game, performCase03Action } from '../../src/case-03/engine.js';

const aligned = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };

test('active case 02 @2 run finishes on old rules without silently growing story state', () => {
  const old = createCase02Game({ templateId: 'balanced', eventRolls: [100, 1], progressionV2: true });
  old.ruleVersion = 'case-02-csv@2';
  delete old.story;
  const request = { ...aligned, operationId: 'old-02-step', stateVersion: old.stateVersion };
  const first = performCase02Action(old, 'B01', request);
  assert.equal(first.state.ruleVersion, 'case-02-csv@2');
  assert.equal(first.state.story, undefined);
  assert.equal(case02PublicView(first.state).story, undefined);
  assert.equal(first.state.progression.runExp, 1);
  const replay = performCase02Action(first.state, 'B01', request);
  assert.equal(replay.cached, true);
  assert.equal(replay.state.token, first.state.token);
  assert.throws(() => performCase02Action(first.state, 'B10', { route: 'prototype', operationId: 'old-02-route', stateVersion: first.state.stateVersion }), /舊局沿用原規則/);
});

test('active case 03 @1 run finishes on old rules without silently growing story state', () => {
  const old = createCase03Game({ templateId: 'balanced', eventRolls: [100, 1], progressionV2: true });
  old.ruleVersion = 'case-03-booking@1';
  delete old.story;
  const request = { scope: 'full', operationId: 'old-03-step', stateVersion: old.stateVersion };
  const first = performCase03Action(old, 'C01', request);
  assert.equal(first.state.ruleVersion, 'case-03-booking@1');
  assert.equal(first.state.story, undefined);
  assert.equal(case03PublicView(first.state).story, undefined);
  assert.equal(first.state.progression.runExp, 1);
  const replay = performCase03Action(first.state, 'C01', request);
  assert.equal(replay.cached, true);
  assert.equal(replay.state.token, first.state.token);
  assert.throws(() => performCase03Action(first.state, 'C09', { route: 'prototype', operationId: 'old-03-route', stateVersion: first.state.stateVersion }), /舊局沿用原規則/);
});
