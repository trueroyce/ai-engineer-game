import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCase04Reward, createCase04Game, performCase04Action } from '../../src/case-04/engine.js';
import { renderCase04Board, renderCase04Result } from '../../src/case-04/render.js';
import { case04EndingScene, renderCase04Scene } from '../../src/case-04/scene.js';

function perform(state, actionId, options = {}) {
  const result = performCase04Action(state, actionId, {
    ...options,
    operationId: `scene-${actionId}-${state.stateVersion}-${Object.values(options).join('-')}`,
    stateVersion: state.stateVersion,
  });
  let next = result.state;
  while (next.pendingReward) next = chooseCase04Reward(next, next.pendingReward.choices[0]).state;
  return { ...result, state: next };
}

test('案件 04 事故室固定呈現三位角色，且不與案件 03 共用人物語氣', () => {
  const state = createCase04Game({ templateId: 'balanced', eventRolls: Array(30).fill(1) });
  const html = renderCase04Board(state);
  assert.match(html, /阿維/);
  assert.match(html, /惠姐/);
  assert.match(html, /小燈/);
  assert.match(html, /昨天還好好的/);
  assert.doesNotMatch(html, /阿改|小美|老周/);
});

test('策略選擇立即命名代價，延遲後果不是隱藏骰點', () => {
  let state = createCase04Game({ templateId: 'balanced', eventRolls: Array(30).fill(1) });
  state = perform(state, 'D01', { method: 'reproduce' }).state;
  const result = perform(state, 'D02', { strategy: 'patch' });
  const html = renderCase04Result(result.state, result.result);

  assert.match(html, /補丁先保服務/);
  assert.match(html, /補丁耦合/);
  assert.match(html, /這條路之後會帶回/);
});

test('rollback 場景先要求當前 revision 的相容性檢查', () => {
  let state = createCase04Game({ templateId: 'balanced', eventRolls: Array(30).fill(1) });
  state = perform(state, 'D01', { method: 'reproduce' }).state;
  state = perform(state, 'D02', { strategy: 'rollback' }).state;

  let html = renderCase04Board(state);
  assert.match(html, /回滾閘門/);
  assert.match(html, /資料不一定答應/);

  const result = perform(state, 'D10', { compatibility: 'inspect' });
  html = renderCase04Result(result.state, result.result);
  assert.match(html, /舊／新資料樣本已證明相容/);
  assert.match(html, /相容決策綁定目前 revision/);
});

test('兩次後續工作後，早期策略由角色具名收帳並保留可行回應', () => {
  let state = createCase04Game({ templateId: 'balanced', eventRolls: Array(40).fill(1) });
  state = perform(state, 'D01', { method: 'reproduce' }).state;
  state = perform(state, 'D02', { strategy: 'patch' }).state;
  state = perform(state, 'D03', { agentMode: 'sequential' }).state;
  state = perform(state, 'D04', { route: 'freeze' }).state;
  state = perform(state, 'D05', { cause: 'code' }).state;
  const result = perform(state, 'D07', { scope: 'full' });
  const html = renderCase04Result(result.state, result.result);

  assert.equal(result.state.story.pendingConsequence.revealed, true);
  assert.match(html, /早期承諾已經過兩次後續工作/);
  assert.match(html, /補丁耦合/);
  const board = renderCase04Board(result.state);
  assert.match(board, /早期選擇終於回來收帳/);
  assert.match(board, /補丁碰到夜間批次/);
});

function rollbackStart() {
  let state = createCase04Game({ templateId: 'ultimate', cards: { C4: 1 }, equipped: ['C4'], eventRolls: Array(80).fill(1) });
  state.token = 60;
  state.timeLeft = 60;
  state = perform(state, 'D01', { method: 'reproduce' }).state;
  return perform(state, 'D02', { strategy: 'rollback' }).state;
}

test('rollback 風險硬交與止損結局不虛構相容檢查或負責人核准', () => {
  for (const [intent, endingId, truth] of [
    ['risk', 'C04-FAILED', '結局仍記為失敗'],
    ['stop', 'C04-STOP', '保留現場並止損'],
  ]) {
    const ended = perform(rollbackStart(), 'D09', { intent }).state;
    const scene = case04EndingScene(ended);
    const html = renderCase04Scene(scene);
    assert.equal(ended.ending.baseId, endingId);
    assert.match(html, /資料相容仍是/);
    assert.match(html, /尚未取得負責人核准/);
    assert.match(html, new RegExp(truth));
    assert.doesNotMatch(html, /已證明相容|負責人核准了/);
  }
});

test('rollback isolate 的有限結局說隔離而非相容，且只引用當前 revision 核准', () => {
  let state = rollbackStart();
  state = perform(state, 'D10', { compatibility: 'isolate' }).state;
  state = perform(state, 'D03', { agentMode: 'sequential' }).state;
  state = perform(state, 'D04', { route: 'freeze' }).state;
  state = perform(state, 'D05', { cause: 'deploy' }).state;
  state = perform(state, 'D07', { scope: 'full' }).state;
  state = perform(state, 'D06', { response: 'isolate' }).state;
  state = perform(state, 'D08', { depth: 'complete' }).state;
  state = perform(state, 'D11', { proposal: 'limited' }).state;
  const ended = perform(state, 'D09', { intent: 'limited' }).state;
  const html = renderCase04Scene(case04EndingScene(ended));

  assert.equal(ended.dataCompatibility, 'isolated');
  assert.equal(ended.approval.status, 'approved');
  assert.equal(ended.approval.revision, ended.revision);
  assert.match(html, /新寫入已隔離/);
  assert.match(html, /不是因為相容/);
  assert.match(html, /有限維持/);
  assert.doesNotMatch(html, /舊／新資料樣本已證明相容/);
});

test('rollback 正式結局只在相容與當前完整核准都存在時宣稱正式交付', () => {
  let state = rollbackStart();
  state = perform(state, 'D10', { compatibility: 'inspect' }).state;
  state = perform(state, 'D03', { agentMode: 'sequential' }).state;
  state = perform(state, 'D04', { route: 'freeze' }).state;
  state = perform(state, 'D05', { cause: 'deploy' }).state;
  state = perform(state, 'D07', { scope: 'full' }).state;
  state = perform(state, 'D06', { response: 'repair' }).state;
  state = perform(state, 'D07', { scope: 'full' }).state;
  state = perform(state, 'D08', { depth: 'complete' }).state;
  state = perform(state, 'D11', { proposal: 'verified' }).state;
  const ended = perform(state, 'D09', { intent: 'verified' }).state;
  const html = renderCase04Scene(case04EndingScene(ended));

  assert.equal(ended.dataCompatibility, 'compatible');
  assert.equal(ended.approval.scope, 'verified');
  assert.match(html, /舊／新資料樣本已證明相容/);
  assert.match(html, /完整範圍/);
  assert.match(html, /正式交付有相容證據與當前核准/);
});
