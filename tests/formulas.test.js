// p／q／cost 公式與 clamp 次序（game-specification.md §2「成功率與隱藏風險」「六卡」）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeP, computeQ, computeCost, clampP, clampQ } from '../src/core/formulas.js';

const attrs = (A, E, V) => ({ A, E, V });
const NO_PREP = { B: 0, N: 0 };

function p(opts) {
  return computeP({ equipped: [], toggles: {}, preparation: NO_PREP, ...opts }).p;
}

test('R04 通用式：E=2、D=1、S=5、B=0 普通實作 p=55', () => {
  assert.equal(p({ action: 'implement', attributes: attrs(2, 2, 2), difficulty: 1, stress: 5 }), 55);
});

test('R04 上限截斷：E=3、D=0、S=0、B20 普通實作原值 100→95', () => {
  const r = computeP({ action: 'implement', attributes: attrs(1, 3, 2), difficulty: 0, stress: 0, preparation: { B: 20, N: 1 }, equipped: [], toggles: {} });
  assert.equal(r.raw, 100);
  assert.equal(r.p, 95);
  assert.equal(r.usesPreparation, true);
});

test('壓力以 floor(S/3) 計：S2→不扣、S3→−5（B12 等號時點）', () => {
  assert.equal(p({ action: 'implement', attributes: attrs(2, 2, 2), difficulty: 1, stress: 2 }), 60);
  assert.equal(p({ action: 'implement', attributes: attrs(2, 2, 2), difficulty: 1, stress: 3 }), 55);
  assert.equal(p({ action: 'implement', attributes: attrs(2, 2, 2), difficulty: 1, stress: 9 }), 45);
});

test('分析用 A 且不加 B：A=2、D=0、S=0、已有 B20 → p=70', () => {
  const r = computeP({ action: 'analyze', attributes: attrs(2, 1, 3), difficulty: 0, stress: 0, preparation: { B: 20, N: 2 }, equipped: [], toggles: {} });
  assert.equal(r.p, 70);
  assert.equal(r.usesPreparation, false);
});

test('屬性對應：實作／趕工／修復用 E，驗證用 V，分析用 A', () => {
  const a = attrs(3, 1, 2);
  assert.equal(p({ action: 'analyze', attributes: a, difficulty: 0, stress: 0 }), 80);
  assert.equal(p({ action: 'implement', attributes: a, difficulty: 0, stress: 0 }), 60);
  assert.equal(p({ action: 'verify', attributes: a, difficulty: 0, stress: 0 }), 70);
  assert.equal(p({ action: 'repair', attributes: a, difficulty: 0, stress: 0 }), 60);
});

test('R04/R05 趕工兩段截斷：原值 110 → 95 → 85，不得一次 clamp 成 95', () => {
  const r = computeP({ action: 'rush', attributes: attrs(2, 3, 1), difficulty: 0, stress: 0, preparation: { B: 30, N: 1 }, equipped: [], toggles: {} });
  assert.equal(r.raw, 110);
  assert.equal(r.general, 95);
  assert.equal(r.p, 85);
});

test('趕工下限：原值 20 → 20 → 10 → 20；原值 25 → 15 → 20', () => {
  // E=1、D=2、S=9：50+10−20−15=25
  assert.equal(p({ action: 'rush', attributes: attrs(3, 1, 2), difficulty: 2, stress: 9 }), 20);
  assert.equal(computeP({ action: 'rush', attributes: attrs(3, 1, 2), difficulty: 2, stress: 12, preparation: NO_PREP, equipped: [], toggles: {} }).raw, 20);
  assert.equal(p({ action: 'rush', attributes: attrs(3, 1, 2), difficulty: 2, stress: 12 }), 20);
});

test('趕工吃準備（先加 B 再兩段截斷）：E=2、D=0、S=0、B10 → 80−10=70', () => {
  const r = computeP({ action: 'rush', attributes: attrs(2, 2, 2), difficulty: 0, stress: 0, preparation: { B: 10, N: 1 }, equipped: [], toggles: {} });
  assert.equal(r.p, 70);
});

test('N=0 時 B 不加；驗證與修復在 N>0 時加 B', () => {
  assert.equal(computeP({ action: 'verify', attributes: attrs(2, 2, 2), difficulty: 0, stress: 0, preparation: { B: 20, N: 0 }, equipped: [], toggles: {} }).p, 70);
  assert.equal(computeP({ action: 'verify', attributes: attrs(2, 2, 2), difficulty: 0, stress: 0, preparation: { B: 10, N: 1 }, equipped: [], toggles: {} }).p, 80);
  assert.equal(computeP({ action: 'repair', attributes: attrs(2, 2, 2), difficulty: 1, stress: 0, preparation: { B: 20, N: 2 }, equipped: [], toggles: {} }).p, 80);
});

test('C3 測試助手：通用 p clamp 後 +20／+30，再 clamp 95；未開啟不加', () => {
  // V=2、D=0、S=3：通用 65
  const base = { action: 'verify', attributes: attrs(2, 2, 2), difficulty: 0, stress: 3, preparation: NO_PREP };
  assert.equal(computeP({ ...base, equipped: [{ id: 'C3', level: 1 }], toggles: { C3: true } }).p, 85);
  assert.equal(computeP({ ...base, equipped: [{ id: 'C3', level: 1 }], toggles: { C3: false } }).p, 65);
  assert.equal(computeP({ ...base, equipped: [{ id: 'C3', level: 2 }], toggles: { C3: true } }).p, 95);
  // V=3、D=0、S=0：通用 80，L2 +30 → 110 → 95
  assert.equal(computeP({ action: 'verify', attributes: attrs(1, 2, 3), difficulty: 0, stress: 0, preparation: NO_PREP, equipped: [{ id: 'C3', level: 2 }], toggles: { C3: true } }).p, 95);
  // 通用原值 100（B20）先截 95，再 +20 → 仍 95
  assert.equal(computeP({ action: 'verify', attributes: attrs(1, 2, 3), difficulty: 0, stress: 0, preparation: { B: 20, N: 1 }, equipped: [{ id: 'C3', level: 1 }], toggles: { C3: true } }).p, 95);
});

test('C4 除錯手冊：修復通用 p clamp 20..95 後 +10／+20，再 clamp 20..95；自動生效', () => {
  // E=2、D=1、S=7：50+20−10−10=50
  const base = { action: 'repair', attributes: attrs(2, 2, 2), difficulty: 1, stress: 7, preparation: NO_PREP, toggles: {} };
  assert.equal(computeP({ ...base, equipped: [] }).p, 50);
  assert.equal(computeP({ ...base, equipped: [{ id: 'C4', level: 1 }] }).p, 60);
  assert.equal(computeP({ ...base, equipped: [{ id: 'C4', level: 2 }] }).p, 70);
  // 合成邊界：E=1、D=2、S=15 → 50+10−20−25=15 → clamp 20 → +10 = 30
  const low = computeP({ action: 'repair', attributes: attrs(3, 1, 2), difficulty: 2, stress: 15, preparation: NO_PREP, equipped: [{ id: 'C4', level: 1 }], toggles: {} });
  assert.equal(low.raw, 15);
  assert.equal(low.p, 30);
  // 通用 90 + 20 → 95
  assert.equal(computeP({ action: 'repair', attributes: attrs(1, 3, 2), difficulty: 0, stress: 0, preparation: { B: 10, N: 1 }, equipped: [{ id: 'C4', level: 2 }], toggles: {} }).p, 95);
});

test('C4 不影響非修復行動；C3 不影響非驗證行動', () => {
  const eq = [{ id: 'C4', level: 2 }, { id: 'C3', level: 2 }];
  assert.equal(computeP({ action: 'implement', attributes: attrs(2, 2, 2), difficulty: 0, stress: 0, preparation: NO_PREP, equipped: eq, toggles: {} }).p, 70);
});

test('開啟未持有的卡是程式錯誤（引擎須先拒絕）', () => {
  assert.throws(() => computeP({ action: 'verify', attributes: attrs(2, 2, 2), difficulty: 0, stress: 0, preparation: NO_PREP, equipped: [], toggles: { C3: true } }), /未持有/);
});

test('clampP 範圍 20..95', () => {
  assert.equal(clampP(19), 20);
  assert.equal(clampP(96), 95);
  assert.equal(clampP(50), 50);
});

// ---- q ----

function q(opts) {
  return computeQ({ equipped: [], toggles: {}, consumesPreparation: false, ...opts }).q;
}

test('R05 q 基準：普通 20、趕工 40，−5×(A−1)', () => {
  assert.equal(q({ action: 'implement', attributes: attrs(1, 3, 2) }), 20);
  assert.equal(q({ action: 'implement', attributes: attrs(2, 2, 2) }), 15);
  assert.equal(q({ action: 'rush', attributes: attrs(2, 2, 2) }), 35);
  assert.equal(q({ action: 'rush', attributes: attrs(3, 2, 1) }), 30);
});

test('消耗準備 −10：A=2 普通實作消耗準備 q=5', () => {
  assert.equal(q({ action: 'implement', attributes: attrs(2, 2, 2), consumesPreparation: true }), 5);
});

test('C2 開啟 +5（L1、L2 相同）：A=2 趕工＋C2 q=40；A=2 普通＋C2 q=20', () => {
  assert.equal(q({ action: 'rush', attributes: attrs(2, 2, 2), equipped: [{ id: 'C2', level: 1 }], toggles: { C2: true } }), 40);
  assert.equal(q({ action: 'rush', attributes: attrs(2, 2, 2), equipped: [{ id: 'C2', level: 2 }], toggles: { C2: true } }), 40);
  assert.equal(q({ action: 'implement', attributes: attrs(2, 2, 2), equipped: [{ id: 'C2', level: 1 }], toggles: { C2: true } }), 20);
  assert.equal(q({ action: 'implement', attributes: attrs(2, 2, 2), equipped: [{ id: 'C2', level: 1 }], toggles: { C2: false } }), 15);
});

test('q clamp 5..60：A=3 普通實作消耗準備 原值 0 → 5', () => {
  const r = computeQ({ action: 'implement', attributes: attrs(3, 2, 1), consumesPreparation: true, equipped: [], toggles: {} });
  assert.equal(r.raw, 0);
  assert.equal(r.q, 5);
  assert.equal(clampQ(61), 60);
  assert.equal(clampQ(4), 5);
});

test('只有普通實作與趕工有 q；其他行動回傳 null', () => {
  for (const action of ['analyze', 'verify', 'repair', 'rest', 'deliver']) {
    assert.equal(computeQ({ action, attributes: attrs(2, 2, 2), consumesPreparation: false, equipped: [], toggles: {} }).q, null);
  }
});

// ---- cost ----

function cost(action, equipped = [], toggles = {}, project = { firstVerificationUsed: false }) {
  return computeCost({ action, equipped, toggles, project }).cost;
}

test('基礎費：分析 2、普通 3、趕工 4、驗證 2、修復 2、休息 0、交付 0', () => {
  assert.deepEqual(['analyze', 'implement', 'rush', 'verify', 'repair', 'rest', 'deliver'].map((a) => cost(a)), [2, 3, 4, 2, 2, 0, 0]);
});

test('C2：開啟 L1 −1、L2 −2，最低 1；未開啟原價', () => {
  assert.equal(cost('implement', [{ id: 'C2', level: 1 }], { C2: true }), 2);
  assert.equal(cost('implement', [{ id: 'C2', level: 2 }], { C2: true }), 1);
  assert.equal(cost('rush', [{ id: 'C2', level: 1 }], { C2: true }), 3);
  assert.equal(cost('rush', [{ id: 'C2', level: 2 }], { C2: true }), 2);
  assert.equal(cost('implement', [{ id: 'C2', level: 2 }], { C2: false }), 3);
});

test('C6：L1 每案第一次驗證 −1；L2 每次 −1；下限 0', () => {
  assert.equal(cost('verify', [{ id: 'C6', level: 1 }], {}, { firstVerificationUsed: false }), 1);
  assert.equal(cost('verify', [{ id: 'C6', level: 1 }], {}, { firstVerificationUsed: true }), 2);
  assert.equal(cost('verify', [{ id: 'C6', level: 2 }], {}, { firstVerificationUsed: true }), 1);
});

test('C3 加付 1；與 C6 疊加先減後加：C6 L1＋C3 首驗 = 2−1+1 = 2', () => {
  assert.equal(cost('verify', [{ id: 'C3', level: 1 }], { C3: true }), 3);
  assert.equal(cost('verify', [{ id: 'C3', level: 2 }], { C3: true }), 3);
  assert.equal(cost('verify', [{ id: 'C6', level: 1 }, { id: 'C3', level: 1 }], { C3: true }, { firstVerificationUsed: false }), 2);
  assert.equal(cost('verify', [{ id: 'C6', level: 2 }, { id: 'C3', level: 1 }], { C3: true }, { firstVerificationUsed: true }), 2);
});

test('費用明細可供預覽顯示', () => {
  const r = computeCost({ action: 'verify', equipped: [{ id: 'C6', level: 1 }, { id: 'C3', level: 1 }], toggles: { C3: true }, project: { firstVerificationUsed: false } });
  assert.deepEqual(r.parts.map((x) => [x.source, x.delta]), [['base', 2], ['C6', -1], ['C3', 1]]);
});
