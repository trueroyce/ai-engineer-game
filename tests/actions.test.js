// action-resolution：七種主要行動的結算（R04/R05/R06/R07）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok, fail, startedGame, patch } from './helpers.js';

// 預設均衡 2/2/2、裝備 C5L1＋C2L1，接 J1（D0、目標 4）。
// 交付等行動可能跨 XP 門檻，預先準備一組合法的指定升級候選。
function j1({ success = [], defect = [], setup = () => {}, equipped, levelDrafts = [['C1', 'C3', 'C4']] } = {}) {
  let s = ok(startedGame({ success, defect, levelDrafts }), 'accept', { projectId: 'J1' });
  return patch(s, (x) => { if (equipped) x.equipped = equipped; setup(x); });
}
const act = (s, action, toggles = {}) => ok(s, 'action', { action, toggles });
const last = (s) => s.events.at(-1);

test('分析成功：費 2、B20/N2、S 不變、只取成功骰', () => {
  const s = act(j1({ success: [70] }), 'analyze');
  const p = s.projects.J1;
  assert.deepEqual([s.token, s.stress, p.preparationBonus, p.preparationUses], [16, 0, 20, 2]);
  assert.equal(s.rng.success.cursor, 1);
  assert.equal(s.rng.defect.cursor, 0);
  assert.deepEqual(last(s).dice, [{ stream: 'success', index: 1, value: 70, designated: true }]);
  assert.equal(last(s).p, 70);
});

test('分析失敗：B10/N1；分析覆蓋舊準備而不疊加', () => {
  const s = act(j1({ success: [71], setup: (x) => { x.projects.J1.preparationBonus = 20; x.projects.J1.preparationUses = 2; } }), 'analyze');
  assert.deepEqual([s.projects.J1.preparationBonus, s.projects.J1.preparationUses], [10, 1]);
});

test('分析不消耗準備：已有 B20/N2 分析時 p 不加 B（A2 → 70）', () => {
  const s = act(j1({ success: [71], setup: (x) => { x.projects.J1.preparationBonus = 20; x.projects.J1.preparationUses = 2; } }), 'analyze');
  assert.equal(last(s).p, 70);
  assert.equal(last(s).outcome.success, false);
});

test('C1 需求筆記：L1 成功 N3／失敗 N2；L2 成功 N4／失敗 N3', () => {
  const cases = [[1, 1, 3], [1, 100, 2], [2, 1, 4], [2, 100, 3]];
  for (const [level, die, n] of cases) {
    const s = act(j1({ success: [die], equipped: [{ id: 'C1', level }] }), 'analyze');
    assert.equal(s.projects.J1.preparationUses, n, `C1 L${level} 骰 ${die}`);
  }
});

test('C1 不追溯：已有 B10/N1 後才取得 C1，現有準備仍為 B10/N1', () => {
  const s = j1({ setup: (x) => { x.projects.J1.preparationBonus = 10; x.projects.J1.preparationUses = 1; }, equipped: [{ id: 'C1', level: 2 }] });
  assert.deepEqual([s.projects.J1.preparationBonus, s.projects.J1.preparationUses], [10, 1]);
});

test('R05 普通實作等號成功：p=70、骰 70 → P+2、S+1、費 3、另取一個秘密骰', () => {
  const s = act(j1({ success: [70], defect: [16] }), 'implement');
  const p = s.projects.J1;
  assert.deepEqual([s.token, s.stress, p.progress, p.hiddenDefects], [15, 1, 2, 0]);
  assert.equal(s.rng.defect.cursor, 1);
  assert.equal(last(s).q, 15);
  assert.deepEqual(last(s).dice.map((d) => [d.stream, d.index, d.value]), [['success', 1, 70], ['defect', 1, 16]]);
});

test('R05 兩骰獨立：普通實作失敗仍取秘密骰並依 q 判定，秘密骰等於 q 新增 H', () => {
  const s = act(j1({ success: [71], defect: [15] }), 'implement');
  assert.deepEqual([s.projects.J1.progress, s.projects.J1.hiddenDefects], [1, 1]);
  assert.equal(last(s).outcome.success, false);
  assert.equal(last(s).outcome.defectAdded, true);
});

test('R04/R05 秘密骰等號：趕工＋C2、A2 → q=40，秘密骰 40 → H+1；41 → 不新增', () => {
  const a = act(j1({ success: [1], defect: [40] }), 'rush', { C2: true });
  assert.equal(a.projects.J1.hiddenDefects, 1);
  const b = act(j1({ success: [1], defect: [41] }), 'rush', { C2: true });
  assert.equal(b.projects.J1.hiddenDefects, 0);
});

test('進度截於目標：J1 P=3 普通實作成功 → P=4', () => {
  const s = act(j1({ success: [1], defect: [100], setup: (x) => { x.projects.J1.progress = 3; } }), 'implement');
  assert.equal(s.projects.J1.progress, 4);
});

test('準備消耗：B20/N1 普通實作 → p 含 +20、q −10，之後 B0/N0', () => {
  const s = act(j1({ success: [90], defect: [100], setup: (x) => { x.projects.J1.preparationBonus = 20; x.projects.J1.preparationUses = 1; } }), 'implement');
  assert.equal(last(s).p, 90);
  assert.equal(last(s).q, 5);
  assert.deepEqual([s.projects.J1.preparationBonus, s.projects.J1.preparationUses], [0, 0]);
});

test('準備 N2 用一次剩 N1、B 保留', () => {
  const s = act(j1({ success: [1], defect: [100], setup: (x) => { x.projects.J1.preparationBonus = 20; x.projects.J1.preparationUses = 2; } }), 'implement');
  assert.deepEqual([s.projects.J1.preparationBonus, s.projects.J1.preparationUses], [20, 1]);
});

test('趕工：費 4、成功 P+3、失敗 P+1、S+2，另判 q（基準 40）', () => {
  const ok1 = act(j1({ success: [60], defect: [100] }), 'rush');
  assert.deepEqual([ok1.token, ok1.stress, ok1.projects.J1.progress], [14, 2, 3]);
  assert.equal(last(ok1).p, 60);
  assert.equal(last(ok1).q, 35);
  const bad = act(j1({ success: [61], defect: [100] }), 'rush');
  assert.deepEqual([bad.projects.J1.progress, bad.stress], [1, 2]);
});

test('R04/R09 C2 開啟：普通實作 L1 費 2、L2 費 1；趕工 L1 費 3；q +5', () => {
  const l1 = act(j1({ success: [1], defect: [100] }), 'implement', { C2: true });
  assert.equal(l1.token, 16);
  assert.equal(last(l1).q, 20);
  const l2 = act(j1({ success: [1], defect: [100], equipped: [{ id: 'C2', level: 2 }] }), 'implement', { C2: true });
  assert.equal(l2.token, 17);
  const rush = act(j1({ success: [1], defect: [100] }), 'rush', { C2: true });
  assert.equal(rush.token, 15);
});

test('R06 驗證成功：全部 H 移入 K 並公開數量；S 不變、不加進度、不取秘密骰', () => {
  const s = act(j1({ success: [70], setup: (x) => { x.projects.J1.progress = 2; x.projects.J1.hiddenDefects = 2; } }), 'verify');
  const p = s.projects.J1;
  assert.deepEqual([p.hiddenDefects, p.knownDefects, p.progress, s.stress, s.token], [0, 2, 2, 0, 16]);
  assert.equal(last(s).outcome.revealed, 2);
  assert.equal(s.rng.defect.cursor, 0);
});

test('R06 乾淨專案驗證成功：定位 0 個，仍視為成功驗證', () => {
  const s = act(j1({ success: [1], setup: (x) => { x.projects.J1.progress = 1; } }), 'verify');
  assert.equal(last(s).outcome.success, true);
  assert.equal(last(s).outcome.revealed, 0);
});

test('R06 驗證失敗：H/K 不變，只說未能定位、不暗示有無缺陷', () => {
  const s = act(j1({ success: [71], setup: (x) => { x.projects.J1.progress = 2; x.projects.J1.hiddenDefects = 1; } }), 'verify');
  assert.deepEqual([s.projects.J1.hiddenDefects, s.projects.J1.knownDefects], [1, 0]);
  assert.equal(last(s).outcome.success, false);
  assert.equal('revealed' in last(s).outcome, false);
  assert.equal(last(s).outcome.message, '驗證未能定位問題；這不代表沒有問題。');
});

test('驗證（成敗皆）設定本案首次驗證旗標；C6 L1 只減第一次', () => {
  let s = j1({ success: [100, 100], equipped: [{ id: 'C6', level: 1 }], setup: (x) => { x.projects.J1.progress = 1; } });
  s = act(s, 'verify');
  assert.equal(s.token, 17);
  assert.equal(s.projects.J1.firstVerificationUsed, true);
  s = act(s, 'verify');
  assert.equal(s.token, 15);
});

test('C3 開啟：驗證費 +1、p +20', () => {
  const s = act(j1({ success: [90], equipped: [{ id: 'C3', level: 1 }], setup: (x) => { x.projects.J1.progress = 1; } }), 'verify', { C3: true });
  assert.equal(s.token, 15);
  assert.equal(last(s).p, 90);
  assert.equal(last(s).outcome.success, true);
});

test('修復：費 2、成功 K−1、失敗 K 不變、S+1；不取秘密骰、不動 H', () => {
  const good = act(j1({ success: [70], setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.knownDefects = 2; x.projects.J1.hiddenDefects = 1; } }), 'repair');
  assert.deepEqual([good.projects.J1.knownDefects, good.projects.J1.hiddenDefects, good.stress, good.token], [1, 1, 1, 16]);
  assert.equal(good.rng.defect.cursor, 0);
  const bad = act(j1({ success: [71], setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.knownDefects = 1; } }), 'repair');
  assert.deepEqual([bad.projects.J1.knownDefects, bad.stress], [1, 1]);
});

test('C4 修復：自動 +10/+20，成功仍只移除 1 個 K', () => {
  const s = act(j1({ success: [90], equipped: [{ id: 'C4', level: 2 }], setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.knownDefects = 3; } }), 'repair');
  assert.equal(last(s).p, 90);
  assert.equal(s.projects.J1.knownDefects, 2);
});

test('休息：費 0、不擲骰、T+4（cap 24）、S−3（下限 0）；C5 另加', () => {
  const plain = act(j1({ equipped: [], setup: (x) => { x.token = 10; x.stress = 2; } }), 'rest');
  assert.deepEqual([plain.token, plain.stress], [14, 0]);
  assert.equal(plain.rng.success.cursor, 0);
  const c5l1 = act(j1({ equipped: [{ id: 'C5', level: 1 }], setup: (x) => { x.token = 10; x.stress = 5; } }), 'rest');
  assert.deepEqual([c5l1.token, c5l1.stress], [15, 2]);
  const cap = act(j1({ equipped: [{ id: 'C5', level: 2 }], setup: (x) => { x.token = 21; x.stress = 4; } }), 'rest');
  assert.deepEqual([cap.token, cap.stress], [24, 1]);
  assert.equal(last(cap).outcome.tokenGained, 3);
});

test('R07 乾淨交付：J1 P4/K0/H0 → T+6（cap 24）、分+2、已交付並關案；不擲骰', () => {
  const s = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.token = 10; } }), 'deliver');
  assert.deepEqual([s.token, s.score, s.projects.J1.status, s.activeProject], [16, 2, 'delivered', null]);
  assert.equal(s.projects.J1.deliveryRewardGranted, true);
  assert.equal(s.rng.success.cursor, 0);
  const capped = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.token = 22; } }), 'deliver');
  assert.equal(capped.token, 24);
});

test('R07 退件：P 滿、K0、H1 → 只告知未通過、S+1、H 仍 1、K 仍 0、無獎勵、不公開數量', () => {
  const s = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.hiddenDefects = 1; } }), 'deliver');
  const p = s.projects.J1;
  assert.deepEqual([p.hiddenDefects, p.knownDefects, p.status, s.stress, s.score, s.token], [1, 0, 'active', 1, 0, 18]);
  const out = last(s).outcome;
  assert.equal(out.delivered, false);
  assert.equal(out.message, '驗收未通過，仍有未定位問題。');
  assert.equal(JSON.stringify(out).includes('"hidden'), false);
});

test('R07 再次盲交：退件後未驗證又交付 → 仍退件、再 S+1，H 不被洗掉', () => {
  let s = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.hiddenDefects = 2; } }), 'deliver');
  s = act(s, 'deliver');
  assert.deepEqual([s.projects.J1.hiddenDefects, s.stress, s.projects.J1.status], [2, 2, 'active']);
});

test('失敗不退費：普通實作失敗仍扣 3', () => {
  const s = act(j1({ success: [100], defect: [100] }), 'implement');
  assert.equal(s.token, 15);
});

test('交付清除準備', () => {
  const s = act(j1({ setup: (x) => { x.projects.J1.progress = 4; x.projects.J1.preparationBonus = 20; x.projects.J1.preparationUses = 2; } }), 'deliver');
  assert.deepEqual([s.projects.J1.preparationBonus, s.projects.J1.preparationUses], [0, 0]);
});

test('使用行動開始時的 S：S3 骰 65 成功，不因成功後 S4 重算', () => {
  // E2、D1（J2）、S3：50+20−10−5=55；改用 J1 D0：S3 → 65
  const s = act(j1({ success: [65], defect: [100], setup: (x) => { x.stress = 3; } }), 'implement');
  assert.equal(last(s).p, 65);
  assert.equal(last(s).outcome.success, true);
  assert.equal(s.stress, 4);
});

test('非法行動不耗回合：P 滿時普通實作被拒，回合不變', () => {
  const s = j1({ setup: (x) => { x.projects.J1.progress = 4; } });
  const out = fail(s, 'action', { action: 'implement', toggles: {} }, 'precondition_failed');
  assert.equal(out.state.turn, s.turn);
});
