import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseCase02Reward, createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { renderCase02Result } from '../../src/case-02/render-v2.js';
import {
  CASE02_CAST,
  case02BoardScene,
  case02EndingScene,
  case02SceneForAction,
  renderCase02Scene,
} from '../../src/case-02/scene.js';

const aligned = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };

function act(state, actionId, options = {}) {
  return performCase02Action(state, actionId, {
    ...options,
    operationId: `${actionId}-${state.stateVersion}`,
    stateVersion: state.stateVersion,
  }).state;
}

test('案件現場固定使用三位 recurring cast，開場由資料窗口說明衝突', () => {
  const state = createCase02Game({ templateId: 'balanced' });
  const scene = case02BoardScene(state);
  const html = renderCase02Scene(scene);
  assert.equal(scene.speakerId, 'chen');
  assert.match(scene.line, /同一筆|最新/);
  for (const cast of Object.values(CASE02_CAST)) {
    assert.match(html, new RegExp(cast.name));
    assert.match(html, new RegExp(cast.role));
  }
  assert.match(html, /data-case02-scene/);
});

test('平行 agent 的早先選擇在整合場景被角色具名回應', () => {
  let state = createCase02Game({ templateId: 'ultimate', eventRolls: Array(12).fill(1) });
  state = act(state, 'B01', aligned);
  state = act(state, 'B02', { strategy: 'two', useRapid: false });
  state = act(state, 'B03', { useFastMerge: false });
  const scene = case02SceneForAction(state, 'B03', {}, state.operationResults[`B03-${state.stateVersion - 1}`]);
  assert.equal(state.story.commitments.parallelSchemaDrift, 'surfaced');
  assert.match(scene.line, /欄位|主表/);
  assert.match(scene.callback, /分歧|下一步/);
});

test('行動結果使用已完成狀態與操作選項，不重播操作前台詞', () => {
  let state = createCase02Game({ templateId: 'ultimate', eventRolls: Array(12).fill(1) });
  const contractOutput = performCase02Action(state, 'B01', {
    ...aligned,
    operationId: 'B01-result-copy',
    stateVersion: state.stateVersion,
  });
  state = contractOutput.state;
  const contractScene = case02SceneForAction(state, 'B01', {}, contractOutput.result);
  assert.match(contractScene.line, /寫進契約|可以被測試/);
  assert.doesNotMatch(contractScene.line, /拜託先定義/);

  const normalizationOutput = performCase02Action(state, 'B02', {
    strategy: 'two',
    useRapid: false,
    operationId: 'B02-result-copy',
    stateVersion: state.stateVersion,
  });
  state = normalizationOutput.state;

  // Even callers without transient form options get the completed state, not preview copy.
  const fallbackScene = case02SceneForAction(state, 'B02', {}, normalizationOutput.result);
  assert.match(fallbackScene.line, /兩份 brief 都交卷/);
  assert.doesNotMatch(fallbackScene.line, /先告訴我分工邊界|可以同時跑兩份 brief/);

  // The result renderer forwards the persisted action options from the matching log entry.
  const html = renderCase02Result(state, normalizationOutput.result);
  assert.match(html, /兩份 brief 都交卷/);
  assert.doesNotMatch(html, /先告訴我分工邊界/);
  assert.doesNotMatch(html, /agent 不會讀心/);
  assert.equal(state.log.at(-1).options.strategy, 'two');
});

test('成功後追加來源會在測試場景回來，處理後仍被結局記得', () => {
  let state = createCase02Game({ templateId: 'ultimate', eventRolls: Array(20).fill(1) });
  state = act(state, 'B01', aligned);
  state = act(state, 'B02', { strategy: 'solo', useRapid: false });
  state = act(state, 'B03', { useFastMerge: false });
  state = chooseCase02Reward(state, state.pendingReward.choices[0]).state;
  state = act(state, 'B11', { route: 'gamble' });
  state = act(state, 'B06', { scope: 'focused' });
  const testScene = case02SceneForAction(state, 'B06');
  assert.equal(state.story.commitments.extraSource, 'surfaced');
  assert.equal(testScene.speakerId, 'mina');
  assert.match(testScene.line, /客服臨時表/);
  assert.match(testScene.callback, /追加.*證據/);

  state = act(state, 'B12', { route: 'targeted-proof' });
  const endingScene = case02EndingScene(state);
  assert.equal(state.story.commitments.extraSource, 'resolved');
  assert.match(endingScene.line, /順手/);
  assert.match(endingScene.callback, /追加來源/);
});

test('舊存檔缺少 story 時，場景仍可安全退回目前工作階段', () => {
  const oldState = createCase02Game({ templateId: 'balanced' });
  delete oldState.story;
  assert.doesNotThrow(() => case02BoardScene(oldState));
  assert.doesNotThrow(() => case02SceneForAction(oldState, 'B06'));
  assert.match(renderCase02Scene(case02BoardScene(oldState)), /小陳/);
});
