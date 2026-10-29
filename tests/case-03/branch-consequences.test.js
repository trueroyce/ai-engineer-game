import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCase03Reward, createCase03Game, performCase03Action } from '../../src/case-03/engine.js';

function act(state, actionId, options = {}, operationId = `${actionId}-${state.stateVersion}`) {
  return performCase03Action(state, actionId, { ...options, operationId, stateVersion: state.stateVersion });
}

test('需求失敗可改做可丟棄原型；原型開新路但不偽裝正式 implementation', () => {
  let state = createCase03Game({ templateId: 'beginner', eventRolls: [100, 1] });
  state = act(state, 'C01', { scope: 'full' }).state;
  assert.equal(state.story.openRecovery.sourceAction, 'C01');
  state = act(state, 'C09', { route: 'prototype' }).state;
  assert.equal(state.story.prototype.complete, true);
  assert.equal(state.story.prototype.disposable, true);
  assert.equal(state.implementation, null);
  assert.equal(state.story.commitments.prototypePromise, 'pending');
});

test('平行 agent 的介面分歧延後到 merge 才浮現，版本轉接只修工程債', () => {
  let state = createCase03Game({ templateId: 'ultimate', eventRolls: [1, 1, 1, 1] });
  state = act(state, 'C01', { scope: 'full' }).state;
  state = act(state, 'C02', { policy: 'explicit' }).state;
  state = act(state, 'C03', { strategy: 'agent' }).state;
  state = chooseCase03Reward(state, state.pendingReward.choices[0]).state;
  assert.equal(state.story.commitments.interfaceDrift, 'pending');
  state = act(state, 'C04', { mergeMode: 'strict' }).state;
  assert.equal(state.story.commitments.interfaceDrift, 'surfaced');
  const debt = state.integrationDebt;
  state.story.commitments.extraAdmin = 'pending';
  state = act(state, 'C11', { route: 'adapter' }).state;
  assert.equal(state.story.commitments.interfaceDrift, 'resolved');
  assert.equal(state.story.commitments.extraAdmin, 'pending');
  assert.equal(state.integrationDebt, Math.max(0, debt - 1));
});

test('成功後加碼管理員功能會在需求變更回來收帳，可明確延期而不是假裝沒處理', () => {
  let state = createCase03Game({ templateId: 'ultimate', eventRolls: [1, 1, 1, 1, 1] });
  state = act(state, 'C01', { scope: 'full' }).state;
  assert.equal(state.story.openOpportunity.sourceAction, 'C01');
  state = act(state, 'C10', { route: 'gamble' }).state;
  state = act(state, 'C02', { policy: 'explicit' }).state;
  state = act(state, 'C03', { strategy: 'pair' }).state;
  state = chooseCase03Reward(state, state.pendingReward.choices[0]).state;
  state = act(state, 'C04', { mergeMode: 'strict' }).state;
  state = act(state, 'C05', { response: 'negotiate' }).state;
  assert.equal(state.story.commitments.extraAdmin, 'surfaced');
  assert.equal(state.change.handled, false);
  state = act(state, 'C11', { route: 'defer' }).state;
  assert.equal(state.story.commitments.extraAdmin, 'resolved');
  assert.equal(state.story.scope, 'core');
  assert.equal(state.requirements.scope, 'core');
});

