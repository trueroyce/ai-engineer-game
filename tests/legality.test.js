// action-resolution：previewAction 唯讀、合法性、進行中專案前置（R04/R05/R06）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewAction, legalActions } from '../src/core/engine.js';
import { ok, fail, gameOnly, startedGame, patch } from './helpers.js';

const ACTIONS = ['analyze', 'implement', 'rush', 'verify', 'repair', 'rest', 'deliver'];
const PROJECT_ACTIONS = ['analyze', 'implement', 'rush', 'verify', 'repair', 'deliver'];

function withJ1(fn = () => {}, opts = {}) {
  return patch(ok(startedGame(opts), 'accept', { projectId: 'J1' }), fn);
}

test('R04 預覽唯讀：不改狀態、不取任何骰', () => {
  const s = withJ1((x) => { x.projects.J1.progress = 2; x.projects.J1.knownDefects = 1; });
  const before = structuredClone(s);
  for (const action of ACTIONS) previewAction(s, { action, toggles: {} });
  previewAction(s, { action: 'implement', toggles: { C2: true } });
  assert.deepEqual(s, before);
});

test('R05 合法性與預覽不依 H：H=0 與 H=2 的可用行動與預覽完全相同', () => {
  const base = (x) => { x.projects.J1.progress = 4; };
  const h0 = withJ1(base);
  const h2 = withJ1((x) => { base(x); x.projects.J1.hiddenDefects = 2; });
  assert.deepEqual(legalActions(h0), legalActions(h2));
  for (const action of ACTIONS) {
    assert.deepEqual(previewAction(h0, { action, toggles: {} }), previewAction(h2, { action, toggles: {} }));
  }
});

test('無進行中專案時只有休息合法；六種行動皆以 no_active_project 拒絕且狀態與游標不變', () => {
  const s = startedGame();
  const legal = legalActions(s).filter((x) => x.legal).map((x) => x.action);
  assert.deepEqual(legal, ['rest']);
  for (const action of PROJECT_ACTIONS) {
    assert.equal(previewAction(s, { action, toggles: {} }).reason.code, 'no_active_project');
    const out = fail(s, 'action', { action, toggles: {} }, 'no_active_project');
    assert.deepEqual(gameOnly(out.state), gameOnly(s));
  }
  const rested = ok(s, 'action', { action: 'rest', toggles: {} });
  assert.equal(rested.turn, 2);
});

test('交付或逾期後、尚未接新案時也只能休息', () => {
  for (const status of ['delivered', 'expired', 'abandoned']) {
    const s = patch(startedGame(), (x) => { x.projects.J1.status = status; x.activeProject = null; });
    assert.deepEqual(legalActions(s).filter((x) => x.legal).map((x) => x.action), ['rest']);
  }
});

test('Token 不足：T=2 普通實作（費 3）→ 拒絕，不扣費、不取骰、不耗回合', () => {
  const s = withJ1((x) => { x.token = 2; }, { success: [1], defect: [1] });
  const pv = previewAction(s, { action: 'implement', toggles: {} });
  assert.equal(pv.legal, false);
  assert.equal(pv.reason.code, 'insufficient_token');
  assert.equal(pv.cost, 3);
  const out = fail(s, 'action', { action: 'implement', toggles: {} }, 'insufficient_token');
  assert.deepEqual(gameOnly(out.state), gameOnly(s));
  assert.equal(out.state.rng.success.cursor, 0);
  assert.equal(out.state.rng.defect.cursor, 0);
});

test('T=0 仍可休息', () => {
  const s = withJ1((x) => { x.token = 0; });
  assert.equal(previewAction(s, { action: 'rest', toggles: {} }).legal, true);
});

test('P 滿時分析、普通實作、趕工不合法；驗證與交付（K0）合法', () => {
  const s = withJ1((x) => { x.projects.J1.progress = 4; });
  const legal = Object.fromEntries(legalActions(s).map((x) => [x.action, x.legal]));
  assert.deepEqual(legal, { analyze: false, implement: false, rush: false, verify: true, repair: false, rest: true, deliver: true });
});

test('P=0 不能驗證（需 P≥1）；K=0 不能修復；P 滿但 K≥1 不能交付', () => {
  const p0 = withJ1();
  assert.equal(previewAction(p0, { action: 'verify', toggles: {} }).reason.code, 'precondition_failed');
  assert.equal(previewAction(p0, { action: 'repair', toggles: {} }).reason.code, 'precondition_failed');
  const k1 = withJ1((x) => { x.projects.J1.progress = 4; x.projects.J1.knownDefects = 1; });
  assert.equal(previewAction(k1, { action: 'deliver', toggles: {} }).legal, false);
  assert.equal(previewAction(k1, { action: 'repair', toggles: {} }).legal, true);
});

test('卡片開關：未持有的卡不能開；不相干的開關拒絕；預設關閉', () => {
  const s = withJ1((x) => { x.projects.J1.progress = 1; });
  assert.equal(previewAction(s, { action: 'verify', toggles: { C3: true } }).reason.code, 'card_not_equipped');
  assert.equal(previewAction(s, { action: 'verify', toggles: { C2: true } }).reason.code, 'invalid_toggle');
  assert.equal(previewAction(s, { action: 'implement', toggles: { C9: true } }).reason.code, 'invalid_toggle');
  const pv = previewAction(s, { action: 'implement' });
  assert.deepEqual(pv.toggles, { C2: false });
  assert.equal(pv.cost, 3);
});

test('R04/R09 C3 開啟後付不起：T=2、驗證基礎 2＋C3 1 → 拒絕，不偷偷關卡', () => {
  const s = withJ1((x) => { x.token = 2; x.projects.J1.progress = 1; x.equipped = [{ id: 'C3', level: 1 }]; });
  const pv = previewAction(s, { action: 'verify', toggles: { C3: true } });
  assert.equal(pv.cost, 3);
  assert.equal(pv.reason.code, 'insufficient_token');
  const out = fail(s, 'action', { action: 'verify', toggles: { C3: true } }, 'insufficient_token');
  assert.deepEqual(gameOnly(out.state), gameOnly(s));
  assert.equal(previewAction(s, { action: 'verify', toggles: { C3: false } }).legal, true);
});

test('預覽與確認一致：顯示費用 3、p=80 → 實際扣 3、以 p=80 判定', () => {
  const s = withJ1((x) => { x.projects.J1.preparationBonus = 10; x.projects.J1.preparationUses = 1; }, { success: [80], defect: [99] });
  const pv = previewAction(s, { action: 'implement', toggles: {} });
  assert.deepEqual([pv.cost, pv.p, pv.q], [3, 80, 5]);
  const after = ok(s, 'action', { action: 'implement', toggles: {} });
  const ev = after.events.at(-1);
  assert.equal(after.token, s.token - 3);
  assert.equal(ev.p, 80);
  assert.equal(ev.cost, 3);
  assert.equal(ev.outcome.success, true);
});

test('一句話摘要由當下狀態計算（費用、成功率、成功／失敗後果、缺陷風險）', () => {
  const s = withJ1();
  const pv = previewAction(s, { action: 'implement', toggles: {} });
  assert.equal(pv.summary, '普通實作成功率 70%，費用 3 Token；成功進度 +2、失敗 +1；兩者都增加 1 壓力。本次有 15% 機會留下尚未發現的缺陷。');
  const pv2 = previewAction(patch(s, (x) => { x.stress = 6; }), { action: 'implement', toggles: {} });
  assert.match(pv2.summary, /成功率 60%/);
});

test('分析會覆蓋既有準備：確認前警告目前值與可能結果', () => {
  const s = withJ1((x) => { x.projects.J1.preparationBonus = 20; x.projects.J1.preparationUses = 2; });
  const pv = previewAction(s, { action: 'analyze', toggles: {} });
  assert.ok(pv.warnings.some((w) => /B20\/N2/.test(w) && /B10\/N1/.test(w)), JSON.stringify(pv.warnings));
});

test('預覽列出 p 組成與 q 組成，供展開算式', () => {
  const s = withJ1();
  const pv = previewAction(s, { action: 'rush', toggles: { C2: true } });
  assert.equal(pv.p, 60);
  assert.equal(pv.q, 40);
  assert.equal(pv.cost, 3);
  assert.ok(pv.pDetail.steps.length >= 4);
  assert.ok(pv.qParts.some((x) => /C2/.test(x.label)));
});

test('行動只能在回合開始或行動選擇階段提交', () => {
  const s = ok(startedGame(), 'earlySettle');
  assert.equal(previewAction(s, { action: 'rest', toggles: {} }).reason.code, 'game_ended');
  fail(s, 'action', { action: 'rest', toggles: {} }, 'game_ended');
});
