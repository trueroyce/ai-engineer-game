// 逐項比對 docs/canonical/game-specification.md §1–§2（v0.3-T3）的數字。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, RULE_VERSION, CARD_IDS, PROJECT_IDS, endingForScore } from '../src/core/rules.js';

test('ruleVersion 為 v0.3-T3', () => {
  assert.equal(RULE_VERSION, 'v0.3-T3');
  assert.equal(RULES.ruleVersion, 'v0.3-T3');
});

test('R01 配點：各 1..3、總 6、四模板同總額', () => {
  assert.deepEqual(RULES.attributes, { min: 1, max: 3, total: 6, keys: ['A', 'E', 'V'] });
  assert.deepEqual(RULES.templates, {
    balanced: { name: '均衡工程師', A: 2, E: 2, V: 2 },
    analyst: { name: '需求分析型', A: 3, E: 2, V: 1 },
    sprinter: { name: '衝刺實作型', A: 1, E: 3, V: 2 },
    verifier: { name: '品質驗證型', A: 2, E: 1, V: 3 },
  });
  for (const t of Object.values(RULES.templates)) assert.equal(t.A + t.E + t.V, 6);
});

test('整局資源：18 回合、T18 上限 24、S≥10 崩潰、XP 門檻 3/6/9、Lv4 封頂、3 槽', () => {
  assert.equal(RULES.totalTurns, 18);
  assert.deepEqual(RULES.token, { start: 18, cap: 24 });
  assert.equal(RULES.stress.start, 0);
  assert.equal(RULES.stress.crashAt, 10);
  assert.deepEqual(RULES.xp.thresholds, [3, 6, 9]);
  assert.equal(RULES.xp.maxLevel, 4);
  assert.equal(RULES.slots, 3);
  assert.deepEqual(RULES.draft, { openingDraw: 4, openingPick: 2, levelUpDraw: 3 });
});

test('三案資料：J1/J2/J3 的 D、P 目標、工期、報酬', () => {
  assert.deepEqual(PROJECT_IDS, ['J1', 'J2', 'J3']);
  const pick = (id) => {
    const { difficulty, target, duration, rewardToken, rewardScore } = RULES.projects[id];
    return { difficulty, target, duration, rewardToken, rewardScore };
  };
  assert.deepEqual(pick('J1'), { difficulty: 0, target: 4, duration: 6, rewardToken: 6, rewardScore: 2 });
  assert.deepEqual(pick('J2'), { difficulty: 1, target: 6, duration: 8, rewardToken: 9, rewardScore: 4 });
  assert.deepEqual(pick('J3'), { difficulty: 2, target: 8, duration: 10, rewardToken: 12, rewardScore: 7 });
  assert.equal(RULES.projects.J1.name, '待辦工具');
  assert.equal(RULES.projects.J2.name, '資料整合');
  assert.equal(RULES.projects.J3.name, 'Agent原型');
});

test('行動基礎費、進度、壓力與休息', () => {
  const a = RULES.actions;
  assert.equal(a.analyze.cost, 2);
  assert.deepEqual(a.analyze.success, { B: 20, N: 2 });
  assert.deepEqual(a.analyze.failure, { B: 10, N: 1 });
  assert.equal(a.analyze.stress, 0);
  assert.deepEqual([a.implement.cost, a.implement.successP, a.implement.failureP, a.implement.stress, a.implement.qBase], [3, 2, 1, 1, 20]);
  assert.deepEqual([a.rush.cost, a.rush.successP, a.rush.failureP, a.rush.stress, a.rush.qBase, a.rush.pPenalty], [4, 3, 1, 2, 40, 10]);
  assert.deepEqual([a.verify.cost, a.verify.stress], [2, 0]);
  assert.deepEqual([a.repair.cost, a.repair.stress], [2, 1]);
  assert.deepEqual([a.rest.cost, a.rest.token, a.rest.stress], [0, 4, -3]);
  assert.deepEqual([a.deliver.cost, a.deliver.rejectStress], [0, 1]);
  assert.equal(RULES.abandonStress, 1);
  assert.equal(RULES.expireStress, 1);
});

test('公式參數：p=clamp(50+10×屬性−10×D−5×floor(S/3)+B,20,95)；q clamp 5..60', () => {
  assert.deepEqual(RULES.formula, {
    pBase: 50, attrStep: 10, difficultyStep: 10, stressStep: 5, stressDivisor: 3,
    pMin: 20, pMax: 95, qAStep: 5, qPrepReduction: 10, qMin: 5, qMax: 60,
  });
  assert.deepEqual(RULES.attributeFor, { analyze: 'A', implement: 'E', rush: 'E', repair: 'E', verify: 'V' });
});

test('R09 六卡 L1/L2 數值（T3：C2 q+5、C4 修復 p+10/+20）', () => {
  assert.deepEqual(CARD_IDS, ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
  const c = RULES.cards;
  assert.deepEqual(c.C1.extraN, [1, 2]);
  assert.deepEqual(c.C2.costReduction, [1, 2]);
  assert.deepEqual(c.C2.qAdd, [5, 5]);
  assert.equal(c.C2.minCost, 1);
  assert.deepEqual(c.C3.extraCost, [1, 1]);
  assert.deepEqual(c.C3.pAdd, [20, 30]);
  assert.deepEqual(c.C4.pAdd, [10, 20]);
  assert.deepEqual(c.C5.restToken, [1, 2]);
  assert.deepEqual(c.C6.discount, [1, 1]);
  assert.deepEqual(c.C6.everyVerification, [false, true]);
  assert.equal(c.C6.minCost, 0);
  assert.deepEqual(Object.values(c).map((x) => x.name), ['需求筆記', '快速原型', '測試助手', '除錯手冊', '節奏管理', '驗收清單']);
  assert.deepEqual(Object.values(c).filter((x) => x.toggle).map((x) => x.id), ['C2', 'C3']);
  for (const card of Object.values(c)) {
    assert.ok(card.levels[0].length > 0 && card.levels[1].length > 0, `${card.id} 需有 L1/L2 說明`);
  }
});

test('結局分段與名稱：≥9 代表作、6..8 穩定交付、2..5 初階接案、0 交件落空；1 分不可能', () => {
  assert.equal(endingForScore(0).name, '交件落空');
  for (const s of [2, 4, 5]) assert.equal(endingForScore(s).name, '初階接案');
  for (const s of [6, 7, 8]) assert.equal(endingForScore(s).name, '穩定交付');
  for (const s of [9, 11, 13]) assert.equal(endingForScore(s).name, '代表作');
  assert.throws(() => endingForScore(1), /不可能/);
  assert.equal(RULES.crashEnding.name, '壓力崩潰');
});

test('RuleSet 凍結，不可在執行中改數值', () => {
  assert.ok(Object.isFrozen(RULES));
  assert.ok(Object.isFrozen(RULES.projects.J1));
  assert.ok(Object.isFrozen(RULES.cards.C2.costReduction));
});
