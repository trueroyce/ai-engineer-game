import test from 'node:test';
import assert from 'node:assert/strict';

import { CASE01_CARD_IDS, CARDS, TEMPLATES } from '../../src/narrative/rules.js';
import {
  case02PublicView,
  chooseCase02Reward,
  createCase02Game,
  performCase02Action,
  previewCase02Action,
} from '../../src/case-02/engine-v2.js';
import { CASE02_REWARD_POOL } from '../../src/case-02/rules.js';

function act(state, actionId, options = {}, operationId = `${actionId}-${state.stateVersion}`) {
  return performCase02Action(state, actionId, { ...options, operationId, stateVersion: state.stateVersion }).state;
}

const aligned = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };

test('六角色用相同公開選項與同一事件樣本時，A 能力造成不同契約結果而非固定角色台詞', () => {
  const outcomes = {};
  for (const templateId of Object.keys(TEMPLATES)) {
    let state = createCase02Game({ templateId, eventRolls: [60] });
    state = act(state, 'B01', aligned);
    outcomes[templateId] = { clarity: state.contract.clarity, title: state.operationResults['B01-0'].title };
  }
  assert.equal(outcomes.ultimate.clarity, true);
  assert.equal(outcomes.analyst.clarity, true);
  assert.equal(outcomes.balanced.clarity, true);
  assert.equal(outcomes.verifier.clarity, true);
  assert.equal(outcomes.builder.clarity, false);
  assert.equal(outcomes.beginner.clarity, false);
  assert.equal(outcomes.builder.title, outcomes.beginner.title, '文本跟著事件結果，不是把某角色固定寫成笨蛋');
  assert.equal(outcomes.ultimate.title, outcomes.balanced.title);
});

test('E 影響整合、V 影響測試；相同公開策略與同一樣本可分出高低能力', () => {
  function integration(templateId) {
    let state = createCase02Game({ templateId, eventRolls: [1, 1, 60] });
    state = act(state, 'B01', aligned);
    state = act(state, 'B02', { strategy: 'solo', useRapid: false });
    state = act(state, 'B03', { useFastMerge: false });
    return state.integration;
  }
  assert.equal(integration('builder').outcome, 'stable');
  assert.equal(integration('beginner').outcome, 'collision');

  function testRun(templateId) {
    let state = createCase02Game({ templateId, eventRolls: [60] });
    state.contract = { ...aligned, clarity: true };
    state.normalization = { complete: true, strategy: 'solo', predictedDebt: 0 };
    state.integration = { complete: true, unresolvedDebt: 0, joinedRows: 12, total: 17820 };
    state.change = { announced: true, handled: true, contractUpdated: true };
    state.provenance = true;
    state.dataRevision = 3;
    return act(state, 'B06', { scope: 'full' }).tests;
  }
  assert.equal(testRun('verifier').failed.length, 0);
  assert.ok(testRun('beginner').failed.includes('測試 runner 漏接退款欄位'));
});

test('低能力失敗會留下公開可恢復狀態，付費重試取得新事件後可修復', () => {
  let state = createCase02Game({
    templateId: 'beginner',
    cards: { C4: 2 },
    equipped: ['C4'],
    eventRolls: [1, 1, 100, 1, 100, 1, 1, 1],
  });
  state = act(state, 'B01', aligned);
  state = act(state, 'B02', { strategy: 'one', useRapid: false });
  state = act(state, 'B03', { useFastMerge: false });
  state = chooseCase02Reward(state, state.pendingReward.choices[0]).state;
  state = act(state, 'B04', { response: 'contract' });
  const debt = state.integration.unresolvedDebt;
  state = act(state, 'B05', { mode: 'repair' }, 'repair-failed');
  assert.equal(state.integration.unresolvedDebt, debt);
  assert.equal(state.operationResults['repair-failed'].outcome, 'repair-failed');
  const timeAfterFailure = state.timeLeft;
  state = act(state, 'B05', { mode: 'repair' }, 'repair-retry');
  assert.equal(state.integration.unresolvedDebt, 0);
  assert.equal(state.operationResults['repair-retry'].outcome, 'repaired');
  assert.ok(state.timeLeft < timeAfterFailure, '重試必須付費，不是免費重骰');
});

test('同 operationId 不能換 payload 重骰；相同 payload 只回快取', () => {
  const original = createCase02Game({ templateId: 'balanced', eventRolls: [100, 1] });
  const request = { ...aligned, operationId: 'contract-once', stateVersion: 0 };
  const first = performCase02Action(original, 'B01', request);
  assert.equal(first.state.eventAudit.length, 1);
  const cached = performCase02Action(first.state, 'B01', request);
  assert.equal(cached.cached, true);
  assert.equal(cached.state.eventAudit.length, 1);
  assert.throws(() => performCase02Action(first.state, 'B01', { ...request, datePolicy: 'keep-source' }), /operation_id_conflict/);
});

test('C1/C3/C6 已滿級時獎池改抽 C7-C12，不會消耗零收益融合', () => {
  let state = createCase02Game({
    templateId: 'balanced',
    cards: { C1: 2, C3: 2, C6: 2 },
    equipped: ['C1', 'C3', 'C6'],
    eventRolls: [1, 1, 1],
    rewardDraws: [['C7', 'C9', 'C12']],
  });
  state = act(state, 'B01', aligned);
  state = act(state, 'B02', { strategy: 'solo', useRapid: false });
  state = act(state, 'B03', { useFastMerge: false });
  assert.deepEqual(state.pendingReward.choices, ['C7', 'C9', 'C12']);
  assert.ok(state.pendingReward.choices.every((id) => (state.cards[id] ?? 0) < CARDS[id].maxLevel));
  const chosen = chooseCase02Reward(state, 'C7');
  assert.equal(chosen.reward.level, 1);
  assert.equal(chosen.reward.disposition, 'collected', '滿三張時新卡收藏，不頂掉裝備');
});

test('全獎池滿級時明示轉為有界 Token 補償並記帳，不出現空選擇或無效 fusion', () => {
  const cards = Object.fromEntries(CASE02_REWARD_POOL.map((id) => [id, 2]));
  let state = createCase02Game({ templateId: 'ultimate', cards, equipped: ['C1', 'C7', 'C9'], eventRolls: [1, 1, 1] });
  state = act(state, 'B01', aligned);
  state = act(state, 'B02', { strategy: 'solo', useRapid: false });
  const before = state.token;
  state = act(state, 'B03', { useFastMerge: false });
  assert.equal(state.pendingReward, null);
  assert.deepEqual(state.rewardFallback, { kind: 'all-cards-maxed', token: 2 });
  assert.ok(state.rewardClaims.includes('reward:integration-kit'));
  assert.equal(state.token, before - previewCase02Action({ ...state, token: before }, 'B03', { useFastMerge: false }).token + 2);
});

test('C7-C12 在案件 02 都有實際、可見且有界的作用；原案件 01 抽池仍只有 C1-C6', () => {
  const plain = createCase02Game({ templateId: 'balanced', eventRolls: [1] });
  const c7 = createCase02Game({ templateId: 'balanced', cards: { C7: 2 }, equipped: ['C7'], eventRolls: [1] });
  assert.ok(previewCase02Action(c7, 'B01').token < previewCase02Action(plain, 'B01').token);

  const c8 = createCase02Game({ templateId: 'balanced', cards: { C8: 2 }, equipped: ['C8'], eventRolls: [1] });
  assert.ok(previewCase02Action(c8, 'B04', { response: 'contract' }).token < previewCase02Action(plain, 'B04', { response: 'contract' }).token);
  const c9 = createCase02Game({ templateId: 'balanced', cards: { C9: 2 }, equipped: ['C9'], eventRolls: [1] });
  assert.ok(previewCase02Action(c9, 'B06', { scope: 'focused' }).coverage > previewCase02Action(plain, 'B06', { scope: 'focused' }).coverage);
  const c10 = createCase02Game({ templateId: 'balanced', cards: { C10: 2 }, equipped: ['C10'], eventRolls: [1] });
  const normalMerge = previewCase02Action(c10, 'B03', { useFastMerge: false });
  const fastMerge = previewCase02Action(c10, 'B03', { useFastMerge: true });
  assert.ok(fastMerge.time < normalMerge.time || fastMerge.token < normalMerge.token);
  assert.equal(fastMerge.fastMergeDebt, 1);
  const c11 = createCase02Game({ templateId: 'balanced', cards: { C11: 2 }, equipped: ['C11'], eventRolls: [1] });
  c11.contract = { ...aligned, clarity: true };
  plain.contract = { ...aligned, clarity: true };
  assert.ok(previewCase02Action(c11, 'B02', { strategy: 'one', useRapid: false }).briefScore > previewCase02Action(plain, 'B02', { strategy: 'one', useRapid: false }).briefScore);
  const c12 = createCase02Game({ templateId: 'balanced', cards: { C12: 2 }, equipped: ['C12'], eventRolls: [1] });
  assert.ok(previewCase02Action(c12, 'B07').token < previewCase02Action(plain, 'B07').token);
  assert.deepEqual(CASE01_CARD_IDS, ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
});

test('玩家公開 view 不洩漏 seed、骰流、門檻、骰值或 eventAudit', () => {
  let state = createCase02Game({ templateId: 'balanced', seed: 123, eventRolls: [50] });
  state = act(state, 'B01', aligned);
  const view = case02PublicView(state);
  const json = JSON.stringify(view);
  for (const secret of ['seed', 'rng', 'threshold', 'roll', 'eventAudit', 'operationResults']) assert.equal(json.includes(secret), false, secret);
});
