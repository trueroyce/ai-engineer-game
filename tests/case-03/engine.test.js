import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareer, settleCase } from '../../src/career/state.js';
import { CASE03_REWARD_POOL } from '../../src/case-03/rules.js';
import { case03PublicView, chooseCase03Reward, createCase03Game, performCase03Action, previewCase03Action } from '../../src/case-03/engine.js';

function act(state, actionId, options = {}, operationId = `${actionId}-${state.stateVersion}`) {
  return performCase03Action(state, actionId, { ...options, operationId, stateVersion: state.stateVersion }).state;
}

function throughImplementation(options = {}) {
  let state = createCase03Game({ templateId: options.templateId ?? 'balanced', cards: options.cards, equipped: options.equipped, rewardLedger: options.rewardLedger, eventRolls: options.eventRolls ?? [1, 1, 1, 1, 1, 1], rewardDraws: options.rewardDraws });
  state = act(state, 'C01', { scope: 'full' });
  state = act(state, 'C02', { policy: 'explicit' });
  state = act(state, 'C03', { strategy: 'pair' });
  return state;
}

function verifiedGame(options = {}) {
  let state = throughImplementation(options);
  if (state.pendingReward) state = chooseCase03Reward(state, state.pendingReward.choices[0]).state;
  state = act(state, 'C04', { mergeMode: 'strict' });
  state = act(state, 'C05', { response: 'negotiate' });
  state = act(state, 'C06', { scope: 'full' });
  state = act(state, 'C07', { intent: 'verified' });
  return state;
}

test('完整 NPC 協作路線可達正式交付，中段獎勵後仍有 merge、變更、測試與交付', () => {
  const state = verifiedGame({ eventRolls: [1, 1, 1, 1, 1, 1], rewardDraws: [['C7', 'C9', 'C12']] });
  assert.equal(state.ending.baseId, 'C03-VERIFIED');
  assert.ok(state.ledger.includes('verified_delivery'));
  assert.ok(state.log.findIndex((item) => item.actionId === 'C03') < state.log.findIndex((item) => item.actionId === 'C04'));
  assert.equal(state.rewardClaims.length, 1);
});

test('A/E/V 分別影響客戶決策、合併實作與回歸；同一公開策略與樣本不寫死角色結論', () => {
  function requirement(templateId) { return act(createCase03Game({ templateId, eventRolls: [60] }), 'C01', { scope: 'core' }).requirements.clear; }
  assert.equal(requirement('ultimate'), true);
  assert.equal(requirement('beginner'), false);

  function implementation(templateId) {
    let state = createCase03Game({ templateId, eventRolls: [1, 1, 60] });
    state = act(state, 'C01', { scope: 'core' });
    state = act(state, 'C02', { policy: 'explicit' });
    return act(state, 'C03', { strategy: 'pair' }).implementation.outcome;
  }
  assert.equal(implementation('builder'), 'aligned');
  assert.equal(implementation('beginner'), 'drifted');

  function validation(templateId) {
    const state = createCase03Game({ templateId, eventRolls: [60] });
    state.requirements = { clear: true }; state.contract = { approved: true }; state.implementation = { complete: true };
    state.merge = { complete: true }; state.change = { announced: true, handled: true }; state.artifactRevision = 2;
    return act(state, 'C06', { scope: 'full' }).evidence.failed.length;
  }
  assert.equal(validation('verifier'), 0);
  assert.equal(validation('beginner'), 1);
});

test('核心與完整需求範圍有真實成本、事件與交付責任差異', () => {
  const base = createCase03Game({ templateId: 'balanced', eventRolls: [70] });
  const corePreview = previewCase03Action(base, 'C01', { scope: 'core' });
  const fullPreview = previewCase03Action(base, 'C01', { scope: 'full' });
  assert.ok(fullPreview.token > corePreview.token || fullPreview.time > corePreview.time);
  const core = act(base, 'C01', { scope: 'core' });
  const full = act(createCase03Game({ templateId: 'balanced', eventRolls: [70] }), 'C01', { scope: 'full' });
  assert.equal(core.requirements.clear, true);
  assert.equal(full.requirements.clear, false);
  assert.ok(case03PublicView(core).blockers.includes('核心範圍未包含完整借用與取消責任'));
});

test('合併失敗留下公開債務，付費修復可先失敗再成功且每次取新事件', () => {
  let state = throughImplementation({ templateId: 'beginner', eventRolls: [1, 1, 1, 100, 100, 1] });
  state = chooseCase03Reward(state, state.pendingReward.choices[0]).state;
  state = act(state, 'C04', { mergeMode: 'strict' });
  assert.ok(state.integrationDebt > 0);
  const afterMerge = state.token;
  state = act(state, 'C08');
  assert.ok(state.integrationDebt > 0);
  assert.ok(state.token < afterMerge);
  const afterFailure = state.token;
  state = act(state, 'C08');
  assert.equal(state.integrationDebt, 0);
  assert.ok(state.token < afterFailure);
});

test('operationId 同內容只回快取，不同內容拒絕，取消預覽不會取事件', () => {
  const original = createCase03Game({ templateId: 'balanced', eventRolls: [50, 1] });
  previewCase03Action(original, 'C01', { scope: 'core' });
  assert.equal(original.eventAudit.length, 0);
  const request = { scope: 'core', operationId: 'once', stateVersion: 0 };
  const first = performCase03Action(original, 'C01', request);
  const cached = performCase03Action(first.state, 'C01', request);
  assert.equal(cached.cached, true);
  assert.equal(cached.state.eventAudit.length, 1);
  assert.throws(() => performCase03Action(first.state, 'C01', { ...request, scope: 'full' }), /operation_id_conflict/);
});

test('C7-C12 在案件 03 各有可見且有界效果，只有啟用卡生效', () => {
  const plain = createCase03Game({ templateId: 'balanced' });
  const equipped = (id) => createCase03Game({ templateId: 'balanced', cards: { [id]: 2 }, equipped: [id] });
  assert.ok(previewCase03Action(equipped('C7'), 'C02', { policy: 'explicit' }).token < previewCase03Action(plain, 'C02', { policy: 'explicit' }).token);
  assert.ok(previewCase03Action(equipped('C8'), 'C01', { scope: 'core' }).token < previewCase03Action(plain, 'C01', { scope: 'core' }).token);
  assert.ok(previewCase03Action(equipped('C9'), 'C06', { scope: 'full' }).token < previewCase03Action(plain, 'C06', { scope: 'full' }).token);
  assert.ok(previewCase03Action(equipped('C10'), 'C04', { mergeMode: 'fast' }).time < previewCase03Action(plain, 'C04', { mergeMode: 'fast' }).time);
  assert.ok(previewCase03Action(equipped('C11'), 'C05', { response: 'negotiate' }).token < previewCase03Action(plain, 'C05', { response: 'negotiate' }).token);
  assert.ok(previewCase03Action(equipped('C12'), 'C08').token < previewCase03Action(plain, 'C08').token);
  const ownedOnly = createCase03Game({ templateId: 'balanced', cards: { C7: 2 }, equipped: [] });
  assert.deepEqual(previewCase03Action(ownedOnly, 'C02', { policy: 'explicit' }), previewCase03Action(plain, 'C02', { policy: 'explicit' }));
});

test('滿級卡排除候選；全池滿級以非零 Token 替代並防重領', () => {
  const cards = Object.fromEntries(CASE03_REWARD_POOL.map((id) => [id, 2]));
  const state = throughImplementation({ cards, equipped: ['C7', 'C9', 'C12'], eventRolls: [1, 1, 1] });
  assert.equal(state.pendingReward, null);
  assert.deepEqual(state.rewardFallback, { kind: 'all-cards-maxed', token: 2 });
  assert.ok(state.rewardClaims.includes('reward:handoff-kit'));
  assert.equal(state.equipped.length, 3);
});

test('公開 view 不洩漏 seed、骰值、門檻、事件流或操作快取', () => {
  const state = act(createCase03Game({ templateId: 'balanced', seed: 7, eventRolls: [50] }), 'C01', { scope: 'core' });
  const json = JSON.stringify(case03PublicView(state));
  for (const key of ['seed', 'rng', 'roll', 'threshold', 'eventAudit', 'operationResults', 'operationPayloads']) assert.equal(json.includes(key), false, key);
});

test('職涯跨案結算累積 EXP、卡庫與裝備；相同 ledger 重玩不重領', () => {
  const game = verifiedGame({ eventRolls: [1, 1, 1, 1, 1, 1], rewardDraws: [['C7', 'C8', 'C9']] });
  const career = createCareer({ careerId: 'career-case03-test', templateId: 'balanced', now: '2026-10-26T00:00:00.000Z' });
  const first = settleCase(career, game, '2026-10-26T01:00:00.000Z');
  assert.equal(first.expGained, 8);
  assert.ok(first.career.cards.C7);
  assert.ok(first.career.equipped.length <= 3);
  const second = settleCase(first.career, game, '2026-10-26T02:00:00.000Z');
  assert.equal(second.expGained, 0);
  assert.equal(second.career.completedCases['case-03'].plays, 2);
});

test('有限、失敗與止損結局可由公開選擇到達，不偽裝成正式成功', () => {
  const empty = createCase03Game({ templateId: 'beginner' });
  assert.throws(() => act(empty, 'C07', { intent: 'limited' }), /尚無可交付子集/);
  assert.equal(empty.phase, 'playing');
  for (const [intent, id] of [['risk', 'C03-FAILED'], ['stop', 'C03-STOP']]) {
    const state = act(createCase03Game({ templateId: 'beginner' }), 'C07', { intent });
    assert.equal(state.ending.baseId, id);
    assert.equal(state.ledger.includes('verified_delivery'), false);
  }
  let limited = throughImplementation({ eventRolls: [1, 1, 1] });
  limited = act(limited, 'C07', { intent: 'limited' });
  assert.equal(limited.ending.baseId, 'C03-LIMITED');
});
