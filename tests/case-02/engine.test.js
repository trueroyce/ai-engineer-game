import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareer, settleCase } from '../../src/career/state.js';
import {
  case02PublicView,
  chooseCase02Reward,
  createCase02Game as createCase02GameV2,
  performCase02Action,
  previewCase02Action,
} from '../../src/case-02/engine-v2.js';
import { CASE02_LIMITS } from '../../src/case-02/rules.js';

const createCase02Game = (options) => createCase02GameV2({ eventRolls: Array(64).fill(1), ...options });

function act(state, actionId, options = {}, operationId = `${actionId}-${state.stateVersion}`) {
  return performCase02Action(state, actionId, {
    ...options,
    operationId,
    stateVersion: state.stateVersion,
  }).state;
}

function integrate(state, strategy = 'solo') {
  state = act(state, 'B01', {
    idPolicy: 'canonical-map',
    datePolicy: 'normalize-iso',
    duplicatePolicy: 'latest-export',
  });
  state = act(state, 'B02', { strategy, useRapid: false });
  state = act(state, 'B03');
  return state.pendingReward ? chooseCase02Reward(state, state.pendingReward.choices[0]).state : state;
}

function verifiedRun(templateId = 'beginner', extras = {}) {
  let state = createCase02Game({ templateId, ...extras });
  state = integrate(state);
  state = act(state, 'B04', { response: 'contract' });
  state = act(state, 'B07');
  state = act(state, 'B06', { scope: 'full' });
  state = act(state, 'B09', { intent: 'verified' });
  return state;
}

test('每次開案重設短期資源，持有卡不等於啟用卡', () => {
  const state = createCase02Game({
    templateId: 'balanced',
    cards: { C1: 2, C2: 1, C3: 1, C4: 1 },
    equipped: ['C1', 'C3', 'C4', 'C2'],
  });
  assert.deepEqual({ token: state.token, stress: state.stress, time: state.timeLeft }, {
    token: CASE02_LIMITS.token,
    stress: 0,
    time: CASE02_LIMITS.deadline,
  });
  assert.deepEqual(state.equipped, ['C1', 'C3', 'C4']);
  assert.equal(previewCase02Action(state, 'B08').recoverToken, 2, '未啟用的 C5 不生效');
});

test('預覽與取消路徑不修改狀態，operationId 重送只回傳快取', () => {
  const original = createCase02Game({ templateId: 'balanced' });
  const snapshot = structuredClone(original);
  previewCase02Action(original, 'B01', {});
  assert.deepEqual(original, snapshot);

  const request = {
    operationId: 'same-operation',
    stateVersion: original.stateVersion,
    idPolicy: 'canonical-map',
    datePolicy: 'normalize-iso',
    duplicatePolicy: 'latest-export',
  };
  const first = performCase02Action(original, 'B01', request);
  const replay = performCase02Action(first.state, 'B01', request);
  assert.equal(replay.cached, true);
  assert.deepEqual(replay.state, first.state);
  assert.equal(replay.state.workCount, 1);
  assert.throws(() => performCase02Action(first.state, 'B01', { ...request, operationId: 'new-operation' }), /重新|更新|確認/);
});

test('模擬 agent 有公開取捨：兩 agent 較快但整合債較高，強溝通只改善 brief', () => {
  let beginner = createCase02Game({ templateId: 'beginner' });
  beginner = act(beginner, 'B01', {
    idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export',
  });
  const solo = previewCase02Action(beginner, 'B02', { strategy: 'solo' });
  const two = previewCase02Action(beginner, 'B02', { strategy: 'two' });
  assert.ok(two.time < solo.time);
  assert.ok(two.predictedDebt > solo.predictedDebt);

  let ultimate = createCase02Game({ templateId: 'ultimate' });
  ultimate = act(ultimate, 'B01', {
    idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export',
  });
  const strongTwo = previewCase02Action(ultimate, 'B02', { strategy: 'two' });
  assert.ok(strongTwo.briefScore > two.briefScore);
  assert.equal(strongTwo.predictedDebt, 1, '兩 agent 的固定整合債不會被強角暗中抹除');
});

test('初心者可用完整公開流程取得 verified，強角不會遇到隱藏加難', () => {
  const beginner = verifiedRun('beginner');
  const ultimate = verifiedRun('ultimate');
  for (const state of [beginner, ultimate]) {
    assert.equal(state.phase, 'ended');
    assert.equal(state.ending.baseId, 'C02-VERIFIED');
    assert.equal(case02PublicView(state).verifiedReady, true);
    assert.equal(state.timeLeft, 2);
    assert.ok(state.token >= 0);
  }
  assert.ok(ultimate.token >= beginner.token, '強角保留資源優勢');
});

test('失敗、有限交付與止損都是實際結局，不會偽裝成成功', () => {
  let limited = createCase02Game({ templateId: 'balanced' });
  limited = integrate(limited);
  limited = act(limited, 'B04', { response: 'patch' });
  limited = act(limited, 'B06', { scope: 'focused' });
  limited = act(limited, 'B09', { intent: 'limited' });
  assert.equal(limited.ending.baseId, 'C02-LIMITED');
  assert.ok(case02PublicView(limited).blockers.length > 0);

  let failed = createCase02Game({ templateId: 'balanced' });
  failed = act(failed, 'B09', { intent: 'rush' });
  assert.equal(failed.ending.baseId, 'C02-FAILED');

  let stopped = createCase02Game({ templateId: 'balanced' });
  stopped = act(stopped, 'B09', { intent: 'stop' });
  assert.equal(stopped.ending.baseId, 'C02-STOP');
  assert.deepEqual(stopped.cards, {});
});

test('資料改版會讓舊測試失效，必須重新測目前 revision', () => {
  let state = createCase02Game({ templateId: 'balanced' });
  state = integrate(state, 'one');
  state = act(state, 'B04', { response: 'contract' });
  state = act(state, 'B07');
  state = act(state, 'B06', { scope: 'full' });
  assert.equal(case02PublicView(state).tests.stale, false);
  state = act(state, 'B01', {
    idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export',
  });
  assert.equal(case02PublicView(state).tests.stale, true);
  assert.throws(() => act(state, 'B09', { intent: 'verified' }), /尚未符合|交付/);
});

test('卡滿時新卡只收藏，同卡融合有上限且不超過三張裝備', () => {
  let full = createCase02Game({
    templateId: 'balanced',
    cards: { C1: 1, C2: 1, C3: 1 },
    equipped: ['C1', 'C2', 'C3'],
  });
  full = integrate(full);
  // integrate 會先處理獎勵；建立第二個 pending 狀態直接驗證滿手新卡行為。
  let pending = createCase02Game({
    templateId: 'balanced', cards: { C1: 1, C2: 1, C3: 1 }, equipped: ['C1', 'C2', 'C3'],
    rewardDraws: [['C6', 'C7', 'C8']],
  });
  pending = act(pending, 'B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' });
  pending = act(pending, 'B02', { strategy: 'solo', useRapid: false });
  pending = act(pending, 'B03');
  const collected = chooseCase02Reward(pending, 'C6');
  assert.equal(collected.reward.disposition, 'collected');
  assert.equal(collected.state.cards.C6, 1);
  assert.deepEqual(collected.state.equipped, ['C1', 'C2', 'C3']);

  let fusedPending = createCase02Game({ templateId: 'balanced', cards: { C1: 1 }, equipped: ['C1'], rewardDraws: [['C1', 'C7', 'C8']] });
  fusedPending = act(fusedPending, 'B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' });
  fusedPending = act(fusedPending, 'B02', { strategy: 'solo', useRapid: false });
  fusedPending = act(fusedPending, 'B03');
  const fused = chooseCase02Reward(fusedPending, 'C1');
  assert.equal(fused.reward.disposition, 'fused');
  assert.equal(fused.state.cards.C1, 2);
  assert.equal(fused.state.equipped.length, 1);
});

test('C1-C6 都有有界機制效果，而且只有啟用時生效', () => {
  const base = createCase02Game({ templateId: 'beginner', cards: { C1: 2, C2: 1, C3: 2, C4: 2, C5: 2, C6: 1 }, equipped: [] });
  const equipped = createCase02Game({ templateId: 'beginner', cards: base.cards, equipped: ['C1', 'C2', 'C3'] });
  let b0 = act(base, 'B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' });
  let b1 = act(equipped, 'B01', { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' });
  assert.ok(previewCase02Action(b1, 'B02', { strategy: 'two', useRapid: false }).briefScore > previewCase02Action(b0, 'B02', { strategy: 'two', useRapid: false }).briefScore);
  assert.ok(previewCase02Action(b1, 'B02', { strategy: 'solo', useRapid: true }).time < previewCase02Action(b0, 'B02', { strategy: 'solo', useRapid: true }).time);

  const c3 = createCase02Game({ templateId: 'balanced', cards: base.cards, equipped: ['C3'] });
  assert.ok(previewCase02Action(c3, 'B06', { scope: 'focused' }).coverage > previewCase02Action(base, 'B06', { scope: 'focused' }).coverage);
  const c4 = createCase02Game({ templateId: 'balanced', cards: base.cards, equipped: ['C4'] });
  assert.ok(previewCase02Action(c4, 'B05', { mode: 'repair' }).token < previewCase02Action(base, 'B05', { mode: 'repair' }).token);
  const c5 = createCase02Game({ templateId: 'balanced', cards: base.cards, equipped: ['C5'] });
  assert.ok(previewCase02Action(c5, 'B08').recoverToken > previewCase02Action(base, 'B08').recoverToken);
  const c6 = createCase02Game({ templateId: 'balanced', cards: base.cards, equipped: ['C6'] });
  assert.ok(previewCase02Action(c6, 'B07').token < previewCase02Action(base, 'B07').token);
});

test('案 2 EXP 與卡獎勵 ledger 防重領；重開只重設案內資源', () => {
  const ended = verifiedRun('beginner');
  const career = createCareer({ careerId: 'career-case02-1234', templateId: 'beginner', now: '2026-10-26T00:00:00.000Z' });
  const first = settleCase(career, ended, '2026-10-26T01:00:00.000Z');
  assert.equal(first.expGained, 8);
  assert.ok(first.career.rewardLedger.includes('case-02:reward:integration-kit'));
  assert.equal(first.career.completedCases['case-02'].plays, 1);
  const replay = settleCase(first.career, ended, '2026-10-26T02:00:00.000Z');
  assert.equal(replay.expGained, 0);
  assert.deepEqual(replay.claimedRewards, []);
  assert.equal(replay.career.completedCases['case-02'].plays, 2);

  const restarted = createCase02Game({
    templateId: replay.career.templateId,
    cards: replay.career.cards,
    equipped: replay.career.equipped,
    rewardLedger: replay.career.rewardLedger,
  });
  assert.equal(restarted.token, CASE02_LIMITS.token);
  assert.equal(restarted.timeLeft, CASE02_LIMITS.deadline);
  assert.equal(restarted.stress, 0);
  assert.deepEqual(restarted.cards, replay.career.cards);
  assert.deepEqual(restarted.equipped, replay.career.equipped);
});
