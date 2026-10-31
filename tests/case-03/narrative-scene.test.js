import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCase03Reward, createCase03Game, performCase03Action } from '../../src/case-03/engine.js';
import { renderCase03Board, renderCase03Result } from '../../src/case-03/render-v2.js';
import { case03EndingScene, case03SceneForAction, renderCase03Scene } from '../../src/case-03/scene.js';

function perform(state, actionId, options = {}) {
  return performCase03Action(state, actionId, {
    ...options,
    operationId: `scene-${actionId}-${state.stateVersion}`,
    stateVersion: state.stateVersion,
  });
}

function claim(state) {
  return state.pendingReward ? chooseCase03Reward(state, state.pendingReward.choices[0]).state : state;
}

test('案件 03 工作板固定呈現三位角色，並依真實進度推進場次', () => {
  let state = createCase03Game({ templateId: 'ultimate', eventRolls: Array(20).fill(1) });
  let html = renderCase03Board(state);
  assert.match(html, /阿改/);
  assert.match(html, /小美/);
  assert.match(html, /老周/);
  assert.match(html, /週一早會/);

  state = perform(state, 'C01', { scope: 'full' }).state;
  html = renderCase03Board(state);
  assert.match(html, /週一午前/);
});

test('非同步核准結果說明已採取的行動，後續責任缺口也立即可見', () => {
  let state = createCase03Game({ templateId: 'ultimate', eventRolls: Array(20).fill(1) });
  state = perform(state, 'C01', { scope: 'full' }).state;
  const result = perform(state, 'C02', { policy: 'async' });
  const html = renderCase03Result(result.state, result.result);

  assert.match(html, /我已在群組核准整份契約/);
  assert.match(html, /還沒有名字/);
  assert.match(html, /核准的責任缺口會在合併時回來/);
  assert.doesNotMatch(html, /我在群組按個讚，就等於全部核准了嗎/);
});

test('平行 agent 的介面承諾會在合併結果回來，而不是只換一句旁白', () => {
  let state = createCase03Game({ templateId: 'ultimate', eventRolls: Array(20).fill(1) });
  state = perform(state, 'C01', { scope: 'full' }).state;
  state = perform(state, 'C02', { policy: 'async' }).state;
  state = perform(state, 'C03', { strategy: 'agent' }).state;
  state = claim(state);
  const result = perform(state, 'C04', { mergeMode: 'strict' });
  const html = renderCase03Result(result.state, result.result);

  assert.equal(result.state.story.commitments.asyncApproval, 'surfaced');
  assert.equal(result.state.story.commitments.interfaceDrift, 'surfaced');
  assert.match(html, /主分支合起來了/);
  assert.match(html, /責任和 cancel 介面一起浮上來/);
  assert.match(html, /新增了可見成本/);
});

test('場景文字會跳脫外部資料，不把角色舞台變成注入點', () => {
  const scene = case03SceneForAction({ artifactRevision: '<img src=x>' }, 'C06');
  const html = renderCase03Scene(scene);
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;/);
});

test('案件 03 的風險、止損與有限結局不再沿用正式驗證台詞', () => {
  for (const [intent, endingId, truth] of [
    ['risk', 'C03-FAILED', '帶著公開缺口硬交'],
    ['stop', 'C03-STOP', '沒有宣稱目前 revision 已經驗證'],
  ]) {
    const ended = perform(createCase03Game({ templateId: 'balanced' }), 'C07', { intent }).state;
    const html = renderCase03Scene(case03EndingScene(ended));
    assert.equal(ended.ending.baseId, endingId);
    assert.match(html, new RegExp(truth));
    assert.doesNotMatch(html, /證據對上了/);
  }

  let limited = createCase03Game({ templateId: 'ultimate', eventRolls: Array(20).fill(1) });
  limited = perform(limited, 'C01', { scope: 'full' }).state;
  limited = perform(limited, 'C02', { policy: 'explicit' }).state;
  limited = perform(limited, 'C03', { strategy: 'pair' }).state;
  limited = claim(limited);
  limited = perform(limited, 'C07', { intent: 'limited' }).state;
  const limitedHtml = renderCase03Scene(case03EndingScene(limited));
  assert.match(limitedHtml, /有限試用沒有被寫成完整交付/);
  assert.doesNotMatch(limitedHtml, /證據對上了/);
});

test('案件 03 只有正式驗證結局會說目前 revision 證據對上', () => {
  let state = createCase03Game({ templateId: 'ultimate', eventRolls: Array(40).fill(1) });
  state.token = 50;
  state.timeLeft = 50;
  state = perform(state, 'C01', { scope: 'full' }).state;
  state = perform(state, 'C02', { policy: 'explicit' }).state;
  state = perform(state, 'C03', { strategy: 'pair' }).state;
  state = claim(state);
  state = perform(state, 'C04', { mergeMode: 'strict' }).state;
  state = claim(state);
  state = perform(state, 'C05', { response: 'negotiate' }).state;
  state = perform(state, 'C06', { scope: 'full' }).state;
  state = perform(state, 'C07', { intent: 'verified' }).state;
  const html = renderCase03Scene(case03EndingScene(state));

  assert.equal(state.ending.baseId, 'C03-VERIFIED');
  assert.match(html, /目前 revision 的證據對上了/);
});
