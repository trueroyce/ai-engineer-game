import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { case02PublicView, chooseCase02Reward, createCase02Game, performCase02Action, previewCase02Action } from '../../src/case-02/engine-v2.js';
import { renderCase02Board, renderCase02Result } from '../../src/case-02/render-v2.js';
import { chooseCase03Reward, createCase03Game, performCase03Action, previewCase03Action } from '../../src/case-03/engine.js';
import { renderCase03Ending } from '../../src/case-03/render.js';
import { createNarrativeGame, chooseUpgrade, openingChoices, performAction, previewAction, upgradeChoices } from '../../src/narrative/engine.js';
import { CARDS as NARRATIVE_CARDS } from '../../src/narrative/rules.js';
import { CARDS as CAREER_CARDS } from '../../src/career/cards.js';
import { createCareer, loadCareer, reserveRun, saveActiveRun, saveCareer, settleCase } from '../../src/career/state-v2.js';

const aligned = { idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export' };

function act02(state, id, options = {}, operationId = `${id}-${state.stateVersion}`) {
  return performCase02Action(state, id, { ...options, operationId, stateVersion: state.stateVersion });
}

function act03(state, id, options = {}, operationId = `${id}-${state.stateVersion}`) {
  return performCase03Action(state, id, { ...options, operationId, stateVersion: state.stateVersion });
}

function act01(state, id, options = {}, operationId = `${id}-${state.stateVersion}`) {
  return performAction(state, id, { ...options, operationId, stateVersion: state.stateVersion });
}

test('case 01 C13 Lv1/Lv2 repair preview, charge, and learning stay aligned', () => {
  for (const level of [1, 2]) {
    let state = createNarrativeGame({
      seed: `case01-c13-repair-${level}`,
      templateId: 'balanced',
      careerCards: { C13: level },
      careerEquipped: ['C13'],
      skipOpeningReward: true,
    });
    state = act01(state, 'A01', { designate: 'A01-A' }).state;
    state = act01(state, 'A04', { designate: 'A04-B' }).state;

    const options = { repairDraft: true };
    const preview = previewAction(state, 'A04', options);
    const request = { ...options, operationId: `case01-c13-retry-${level}`, stateVersion: state.stateVersion };
    const before = { token: state.token, timeLeft: state.timeLeft };
    const executed = performAction(state, 'A04', request);

    assert.equal(preview.retry, true);
    assert.equal(preview.cost, 1);
    assert.equal(preview.timeCost, level === 2 ? 0 : 1);
    assert.equal(preview.retryLearningGain, level === 2 ? 18 : 16);
    assert.equal(before.token - executed.state.token, preview.cost);
    assert.equal(before.timeLeft - executed.state.timeLeft, preview.timeCost);
    assert.equal(executed.result.retry.learningGain, preview.retryLearningGain);
    assert.equal(executed.state.retryUnderstanding.A04, preview.retryLearningGain);

    const repeated = performAction(executed.state, 'A04', request);
    assert.equal(repeated.cached, true);
    assert.equal(repeated.state.token, executed.state.token);
    assert.equal(repeated.state.timeLeft, executed.state.timeLeft);
    assert.equal(repeated.state.retryUnderstanding.A04, executed.state.retryUnderstanding.A04);
  }
});

test('case 03 six first work attempts unlock rewards near one-third and two-thirds despite failures', () => {
  let state = createCase03Game({
    seed: 'natural-reward-14',
    templateId: 'beginner',
    progressionV2: true,
    eventRolls: [51, 1, 1, 1, 100, 1, 100, 1],
  });
  const outcomes = [];
  const run = (id, options) => {
    const output = act03(state, id, options);
    state = output.state;
    outcomes.push(output.result.attempt.outcome);
  };

  run('C01', { scope: 'core' });
  assert.equal(state.progression.runExp, 1);
  assert.equal(state.pendingReward, null);
  run('C02', { policy: 'explicit' });
  assert.equal(state.progression.runExp, 2);
  assert.equal(state.pendingReward.slot, 1);
  state = chooseCase03Reward(state, state.pendingReward.choices[0]).state;
  run('C03', { strategy: 'solo' });
  assert.equal(state.progression.runExp, 3);
  run('C04', { mergeMode: 'strict' });
  assert.equal(state.progression.runExp, 4);
  assert.equal(state.pendingReward.slot, 2);
  state = chooseCase03Reward(state, state.pendingReward.choices[0]).state;
  run('C05', { response: 'negotiate' });
  run('C06', { scope: 'full' });

  assert.deepEqual(outcomes, ['success', 'success', 'success', 'success', 'failure', 'failure']);
  assert.equal(state.progression.runExp, 6);
  assert.equal(state.progression.rewardMilestones.filter((item) => item.status === 'claimed').length, 2);
  assert.equal(state.careerRewards.length, 2);
  assert.equal(state.pendingReward, null);
});

test('case 03 retrying the same work cannot farm progress, and early stop gets no second card', () => {
  let state = createCase03Game({ templateId: 'beginner', progressionV2: true, eventRolls: [100, 1, 100, 1] });
  state = act03(state, 'C01', { scope: 'core' }, 'first-c01').state;
  assert.equal(state.progression.runExp, 1);
  state = act03(state, 'C01', { scope: 'core' }, 'retry-c01').state;
  assert.equal(state.progression.runExp, 1);
  state = act03(state, 'C07', { intent: 'stop' }, 'early-stop').state;
  assert.equal(state.phase, 'ended');
  assert.equal(state.careerRewards.length, 0);
  assert.equal(state.progression.rewardMilestones.filter((item) => item.status === 'claimed').length, 0);
});

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

test('案件 02 的 v2 run 在第 2/4 個實質進度各有一次三選一，刷新重送不會重領', () => {
  let state = createCase02Game({ templateId: 'balanced', progressionV2: true, eventRolls: Array(16).fill(1) });
  state = act02(state, 'B01', aligned).state;
  state = act02(state, 'B02', { strategy: 'solo', useRapid: false }).state;
  assert.equal(state.pendingReward.slot, 1);
  const firstChoice = state.pendingReward.choices[0];
  state = chooseCase02Reward(state, firstChoice).state;
  state = act02(state, 'B03', { useFastMerge: false }).state;
  state = act02(state, 'B04', { response: 'contract' }).state;
  assert.equal(state.pendingReward.slot, 2);
  const before = structuredClone(state);
  const request = state.pendingReward.choices[0];
  const chosen = chooseCase02Reward(state, request);
  const repeated = chooseCase02Reward(before, request);
  assert.deepEqual(chosen.reward, repeated.reward);
  state = chosen.state;
  assert.equal(state.progression.rewardMilestones.filter((item) => item.status === 'claimed').length, 2);
  assert.equal(state.careerRewards.length, 2);
});

test('案件 02 的前期 partial 留下公開債務，並在整合時真實承接', () => {
  const success = act02(createCase02Game({ templateId: 'balanced', progressionV2: true, eventRolls: [70] }), 'B01', aligned).state;
  let partial = act02(createCase02Game({ templateId: 'balanced', progressionV2: true, eventRolls: [71, 1, 1] }), 'B01', aligned).state;
  assert.equal(success.lastAttempt.outcome, 'success');
  assert.equal(success.preIntegrationDebt, 0);
  assert.equal(partial.lastAttempt.outcome, 'partial');
  assert.equal(partial.preIntegrationDebt, 1);
  assert.ok(case02PublicView(partial).blockers.some((item) => item.includes('前期整合債')));
  assert.match(renderCase02Board(partial), /前期整合債/);
  assert.match(renderCase02Result(partial, partial.operationResults['B01-0']), /多留 1 點公開整合債/);

  partial = act02(partial, 'B02', { strategy: 'solo', useRapid: false }).state;
  partial = chooseCase02Reward(partial, partial.pendingReward.choices[0]).state;
  partial = act02(partial, 'B03', { useFastMerge: false }).state;
  assert.equal(partial.preIntegrationDebt, 0);
  assert.equal(partial.integration.unresolvedDebt, 1);
  assert.ok(case02PublicView(partial).blockers.some((item) => item.includes('整合債')));
});

test('案件 02 正規化 partial 與 success 有不同狀態，債務會進入後續整合', () => {
  function normalize(draw) {
    let state = createCase02Game({ templateId: 'balanced', progressionV2: true, eventRolls: [1, draw, 1] });
    state = act02(state, 'B01', aligned).state;
    return act02(state, 'B02', { strategy: 'solo', useRapid: false }).state;
  }
  const success = normalize(80);
  let partial = normalize(81);
  assert.equal(success.lastAttempt.outcome, 'success');
  assert.equal(success.normalization.predictedDebt, 0);
  assert.equal(partial.lastAttempt.outcome, 'partial');
  assert.equal(partial.normalization.predictedDebt, 1);
  assert.match(renderCase02Result(partial, partial.operationResults['B02-1']), /多留 1 點公開整合債/);
  partial = chooseCase02Reward(partial, partial.pendingReward.choices[0]).state;
  partial = act02(partial, 'B03', { useFastMerge: false }).state;
  assert.equal(partial.integration.unresolvedDebt, 1);
});

test('C13 三案說明一致，第一次付費重試的預覽與實際成本相符', () => {
  assert.equal(CAREER_CARDS.C13.description, NARRATIVE_CARDS.C13.description);
  assert.equal(CAREER_CARDS.C13.upgradeDescription, NARRATIVE_CARDS.C13.upgradeDescription);
  for (const level of [1, 2]) {
    let state = createCase02Game({ templateId: 'balanced', progressionV2: true, cards: { C13: level }, equipped: ['C13'], eventRolls: [100, 1, 1] });
    state = act02(state, 'B01', aligned).state;
    const preview = previewCase02Action(state, 'B01', aligned);
    assert.equal(preview.retryTokenDiscount, 1);
    assert.equal(preview.token, 1);
    assert.equal(preview.time, level === 2 ? 0 : 1);
    assert.equal(preview.attempt.retryLearningGain, level === 2 ? 18 : 16);
    const before = { token: state.token, time: state.timeLeft };
    state = act02(state, 'B01', aligned, `retry-c13-${level}`).state;
    assert.equal(before.token - state.token, preview.token);
    assert.equal(before.time - state.timeLeft, preview.time);
  }
});

test('案件 03 失敗後才抽情境；付費重試提高機率，同事件續篇承接但只降該事件權重', () => {
  let state = createCase03Game({ templateId: 'beginner', progressionV2: true, cards: { C13: 2, C17: 1 }, equipped: ['C13', 'C17'], eventRolls: [100, 1, 100, 1] });
  const firstPreview = previewCase03Action(state, 'C01', { scope: 'full' });
  const first = act03(state, 'C01', { scope: 'full' }, 'first'); state = first.state;
  const retryPreview = previewCase03Action(state, 'C01', { scope: 'full' });
  const retryResources = { token: state.token, time: state.timeLeft };
  const second = act03(state, 'C01', { scope: 'full' }, 'second'); state = second.state;
  assert.equal(first.result.attempt.outcome, 'failure');
  assert.equal(second.result.attempt.outcome, 'failure');
  assert.ok(retryPreview.attempt.chance > firstPreview.attempt.chance);
  assert.equal(second.result.attempt.retry, true);
  assert.equal(retryPreview.retryTokenDiscount, 1);
  assert.equal(retryResources.token - state.token, retryPreview.token);
  assert.equal(retryResources.time - state.timeLeft, retryPreview.time);
  assert.equal(second.result.attempt.sequel, 2);
  assert.match(second.result.process.followUp, /續篇/);
  assert.equal(state.eventAudit.length, 2);
});

test('C14 擦線失敗轉成公開部分成功，C18 邊界卡加成與預覽一致', () => {
  const plain = createCase03Game({ templateId: 'balanced', progressionV2: true, eventRolls: [74] });
  const radar = createCase03Game({ templateId: 'balanced', progressionV2: true, cards: { C18: 1 }, equipped: ['C18'], eventRolls: [74] });
  assert.equal(previewCase03Action(radar, 'C01', { scope: 'full' }).attempt.chance, previewCase03Action(plain, 'C01', { scope: 'full' }).attempt.chance + 8);
  const near = createCase03Game({ templateId: 'balanced', progressionV2: true, cards: { C14: 1 }, equipped: ['C14'], eventRolls: [70] });
  const output = act03(near, 'C01', { scope: 'full' });
  assert.equal(output.result.attempt.outcome, 'partial');
  assert.equal(output.result.attempt.cardTrigger, 'C14');
  assert.match(output.result.title, /有條件通過/);
});

test('完整 active run 連 RNG、快取、兩段獎勵一起存回同一 run，reload 不另配號', () => {
  const storage = new MemoryStorage();
  let career = createCareer({ careerId: 'career-v2-reload-test', templateId: 'balanced', now: '2026-10-28T00:00:00.000Z' });
  career.cards.C1 = 1; career.loadoutsByCase['case-02'] = ['C1']; career.starterSelection = { status: 'completed', cardId: 'C1' };
  const initial = createCase02Game({ templateId: 'balanced', cards: career.cards, equipped: ['C1'], progressionV2: true, eventRolls: Array(12).fill(1) });
  const reserved = reserveRun(career, { caseId: 'case-02', rulesVersion: initial.ruleVersion, initialState: initial, now: '2026-10-28T00:01:00.000Z' });
  career = reserved.career;
  let state = { ...initial, runId: reserved.activeRun.runId };
  state = act02(state, 'B01', aligned).state;
  career = saveActiveRun(career, state.runId, state, '2026-10-28T00:02:00.000Z');
  saveCareer(career, storage, '2026-10-28T00:02:00.000Z');
  const loaded = loadCareer(storage).career;
  assert.equal(loaded.activeRun.runId, state.runId);
  assert.deepEqual(loaded.activeRun.state.operationResults, state.operationResults);
  assert.deepEqual(loaded.activeRun.state.rng, state.rng);
  assert.equal(loaded.nextRunNumber, 2);
});

test('同一局結算防重，合法新 run 可再次取得兩段職涯獎勵', () => {
  let career = createCareer({ careerId: 'career-v2-replay-test', templateId: 'balanced' });
  career.cards.C1 = 1; career.loadoutsByCase['case-03'] = ['C1']; career.starterSelection = { status: 'completed', cardId: 'C1' };
  const makeEnded = (runId) => ({ caseId: 'case-03', runId, phase: 'ended', ending: { baseId: 'C03-STOP' }, ledger: [], cards: { C1: 1 }, equipped: ['C1'], rewardClaims: ['reward:milestone-1', 'reward:milestone-2'], careerRewards: [{ kind: 'shard', amount: 1, claimId: 'reward:milestone-1' }, { kind: 'career-exp', amount: 2, claimId: 'reward:milestone-2' }] });
  const firstState = makeEnded('run-career-v2-replay-test-1');
  let first = settleCase(career, firstState);
  const duplicate = settleCase(first.career, firstState);
  assert.equal(duplicate.repeated, true);
  const second = settleCase(first.career, makeEnded('run-career-v2-replay-test-2'));
  assert.equal(second.career.cardShards, 2);
  assert.equal(second.career.exp, 4);
});

test('案件 01 職涯沿用 2/4 兩次成長，滿級候選以永久替代獎勵而非吞獎', () => {
  const cards = Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C13', 'C14', 'C16'].map((id) => [id, 2]));
  const state = createNarrativeGame({ seed: 'career-v2-case1', templateId: 'balanced', careerCards: cards, careerEquipped: ['C1', 'C13', 'C16'], skipOpeningReward: true });
  state.pendingUpgrades = [2]; state.xp = 2;
  assert.deepEqual(upgradeChoices(state), ['shard-1', 'shard-2', 'career-exp-2']);
  const picked = chooseUpgrade(state, 'shard-2');
  assert.equal(picked.careerRewards[0].amount, 2);
  assert.equal(picked.rewardClaims[0], 'reward:milestone-1');
});

test('案件 01 經典模式保留原六卡池；職涯帶跨案卡回來不報錯也不啟用不適用卡', () => {
  assert.ok(openingChoices('classic-stable').every((id) => ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'].includes(id)));
  const state = createNarrativeGame({
    seed: 'career-cross-case-return', templateId: 'balanced',
    careerCards: { C1: 1, C15: 1, C17: 2, C18: 1 },
    careerEquipped: ['C1', 'C15', 'C18'], skipOpeningReward: true,
  });
  assert.deepEqual(state.equipped, ['C1']);
  assert.equal(state.cards.C15, 1);
  assert.equal(state.cards.C17, 2);
  assert.equal(state.cards.C18, 1);
});

test('結局由核心結果加至多三個玩法稱號組成，玩家 UI 不顯示內部 ending ID', () => {
  let state = createCase03Game({ templateId: 'balanced', progressionV2: true });
  state.token = 12; state.phase = 'ended'; state.ending = { baseId: 'C03-STOP', title: '把止損寫進交接', text: '保留目前證據。', playFacets: [{ id: 'token-miser', title: 'Token 守財奴', text: '抱著資源回大廳。' }] };
  const html = renderCase03Ending(state, { expGained: 0 });
  assert.match(html, /Token 守財奴/);
  assert.doesNotMatch(html, /C03-STOP|token-miser/);
});

test('案件 03 使用獨立主題且不再顯示 CSV 浮水印', async () => {
  const [html, css] = await Promise.all([readFile(new URL('../../case-03.html', import.meta.url), 'utf8'), readFile(new URL('../../case-03.css', import.meta.url), 'utf8')]);
  assert.match(html, /case-03\.css/);
  assert.match(css, /content:\s*"NPC"/);
  assert.doesNotMatch(css, /content:\s*"CSV"/);
});

test('職涯角色模板只呈現敘事強弱，不直接顯示內部 A/E/V 數值', async () => {
  const source = await readFile(new URL('../../src/career/main.js', import.meta.url), 'utf8');
  const templates = source.slice(source.indexOf('function templatesHtml()'), source.indexOf('function renderOnboarding'));
  assert.doesNotMatch(templates, /template\.attrs|需求\s*\$\{|實作\s*\$\{|驗證\s*\$\{/);
  for (const label of ['需求釐清最可靠', '實作速度最亮眼', '驗證與除錯最可靠', '每一步都有學費']) assert.match(templates, new RegExp(label));
});
