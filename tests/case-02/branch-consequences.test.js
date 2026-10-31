import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCase02Reward, createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';

const aligned = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };
function act(state, actionId, options = {}, operationId = `${actionId}-${state.stateVersion}`) {
  return performCase02Action(state, actionId, { ...options, operationId, stateVersion: state.stateVersion });
}

test('B01 失敗開出原型、縮限與硬做；選原型會留下有限範圍且重送不重扣', () => {
  let state = createCase02Game({ templateId: 'beginner', eventRolls: [100, 1] });
  state = act(state, 'B01', aligned).state;
  assert.equal(state.story.openRecovery.sourceAction, 'B01');
  const request = { route: 'prototype', operationId: 'recovery-once', stateVersion: state.stateVersion };
  const first = performCase02Action(state, 'B10', request);
  assert.equal(first.state.story.scope, 'prototype');
  assert.match(first.state.story.recoveryHistory[0].route, /prototype/);
  assert.ok(first.state.token < state.token);
  const cached = performCase02Action(first.state, 'B10', request);
  assert.equal(cached.cached, true);
  assert.equal(cached.state.token, first.state.token);
  assert.equal(cached.state.story.recoveryHistory.length, 1);
});

test('平行 agent 的欄位分歧在整合時回來，B12 只修該債不洗掉其他承諾', () => {
  let state = createCase02Game({ templateId: 'ultimate', eventRolls: [1, 1, 1] });
  state = act(state, 'B01', aligned).state;
  state = act(state, 'B02', { strategy: 'two', useRapid: false }).state;
  assert.equal(state.story.commitments.parallelSchemaDrift, 'pending');
  state = act(state, 'B03', { useFastMerge: false }).state;
  assert.equal(state.story.commitments.parallelSchemaDrift, 'surfaced');
  assert.ok(state.integration.unresolvedDebt >= 1);
  state = chooseCase02Reward(state, state.pendingReward.choices[0]).state;
  state.story.commitments.verbalChange = 'pending';
  const before = state.integration.unresolvedDebt;
  state = act(state, 'B12', { route: 'shared-sample' }).state;
  assert.equal(state.story.commitments.parallelSchemaDrift, 'resolved');
  assert.equal(state.story.commitments.verbalChange, 'pending');
  assert.equal(state.integration.unresolvedDebt, Math.max(0, before - 1));
});

test('成功後貪心追加來源，聚焦測試會讓延後後果浮現，再以定向證據處理', () => {
  let state = createCase02Game({ templateId: 'ultimate', eventRolls: [1, 1, 1, 1] });
  state = act(state, 'B01', aligned).state;
  state = act(state, 'B02', { strategy: 'solo', useRapid: false }).state;
  state = act(state, 'B03', { useFastMerge: false }).state;
  state = chooseCase02Reward(state, state.pendingReward.choices[0]).state;
  assert.equal(state.story.openOpportunity.sourceAction, 'B03');
  state = act(state, 'B11', { route: 'gamble' }).state;
  assert.equal(state.story.commitments.extraSource, 'pending');
  state = act(state, 'B06', { scope: 'focused' }).state;
  assert.equal(state.story.commitments.extraSource, 'surfaced');
  assert.ok(state.tests.failed.some((item) => item.includes('額外來源')));
  state = act(state, 'B12', { route: 'targeted-proof' }).state;
  assert.equal(state.story.commitments.extraSource, 'resolved');
  assert.equal(state.tests.failed.some((item) => item.includes('額外來源')), false);
});

