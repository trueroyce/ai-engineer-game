// replay-integrity：玩家／稽核視圖分離、事件紀錄、匯出與重播（R05/R11）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/core/engine.js';
import { projectPlayerView, projectAuditView } from '../src/core/view.js';
import { exportAuditLog, replay } from '../src/core/log.js';
import { ok, send, injected, startedGame, patch } from './helpers.js';

// 一段會新增隱藏缺陷、退件、驗證定位、修復、交付的 J1 歷程。
function playedJ1() {
  let s = createGame({ gameId: 'view', rng: injected({ success: [1, 1, 1, 1], defect: [1, 100], card: [['C1', 'C2', 'C5', 'C4'], ['C4', 'C5', 'C1']] }) });
  s = ok(s, 'setAttributes', { template: 'balanced' });
  s = ok(s, 'chooseOpening', { cardIds: ['C5', 'C2'] });
  s = ok(s, 'accept', { projectId: 'J1' });
  s = ok(s, 'action', { action: 'rush', toggles: { C2: true } }); // P3，秘密骰 1 → H1
  s = ok(s, 'action', { action: 'implement', toggles: {} }); // P4
  s = ok(s, 'action', { action: 'deliver', toggles: {} }); // 退件
  s = ok(s, 'action', { action: 'verify', toggles: {} }); // 定位 1，品質 XP → XP3 升 Lv2
  s = ok(s, 'chooseDraft', { choice: { type: 'forfeit' } });
  s = ok(s, 'action', { action: 'repair', toggles: {} }); // K0
  return s;
}

test('R05 玩家視圖不含 H、秘密骰、亂數狀態、請求紀錄與操作快取', () => {
  const s = playedJ1();
  const v = projectPlayerView(s);
  for (const key of ['rng', 'log', 'operationResults']) assert.equal(key in v, false, key);
  for (const p of Object.values(v.projects)) assert.equal('hiddenDefects' in p, false);
  const text = JSON.stringify(v);
  assert.doesNotMatch(text, /hiddenDefects/);
  assert.doesNotMatch(text, /"defect"/);
  assert.doesNotMatch(text, /defectAdded/);
  for (const e of v.events) {
    assert.ok(e.dice.every((d) => d.stream !== 'defect'));
  }
});

test('R11 稽核視圖保留完整資訊：H、秘密骰與其索引', () => {
  const s = playedJ1();
  const a = projectAuditView(s);
  const rush = a.events.find((e) => e.action === 'rush');
  assert.deepEqual(rush.dice.map((d) => [d.stream, d.index, d.value]), [['success', 1, 1], ['defect', 1, 1]]);
  assert.equal(rush.outcome.defectAdded, true);
  assert.equal(rush.after.projects.J1.hiddenDefects, 1);
});

test('視圖比較：H=0 與 H=2 的兩個其他條件相同的狀態，玩家視圖完全相同', () => {
  const base = ok(startedGame(), 'accept', { projectId: 'J1' });
  const h0 = patch(base, (x) => { x.projects.J1.progress = 4; });
  const h2 = patch(base, (x) => { x.projects.J1.progress = 4; x.projects.J1.hiddenDefects = 2; });
  assert.deepEqual(projectPlayerView(h0), projectPlayerView(h2));
  assert.notDeepEqual(projectAuditView(h0), projectAuditView(h2));
});

test('進行中專案時玩家視圖顯示「可能仍有未發現問題」，與 H 無關', () => {
  const s = ok(startedGame(), 'accept', { projectId: 'J1' });
  assert.equal(projectPlayerView(s).unknownRiskNotice, '可能仍有未發現問題');
  assert.equal(projectPlayerView(startedGame()).unknownRiskNotice, null);
});

test('退件事件在玩家視圖只說未通過，不含數量', () => {
  const v = projectPlayerView(playedJ1());
  const rejected = v.events.find((e) => e.action === 'deliver');
  assert.equal(rejected.outcome.delivered, false);
  assert.equal(rejected.outcome.message, '驗收未通過，仍有未定位問題。');
  const verify = v.events.find((e) => e.action === 'verify');
  assert.equal(verify.outcome.revealed, 1, '驗證成功的定位數是公開資訊');
});

test('R11 事件紀錄欄位：序號、規則版本、操作 ID、前後狀態、成本、p/q、骰來源與索引、結果', () => {
  const s = playedJ1();
  s.events.forEach((e, i) => assert.equal(e.seq, i + 1));
  const rush = s.events.find((e) => e.action === 'rush');
  for (const key of ['seq', 'ruleVersion', 'operationId', 'type', 'turn', 'before', 'after', 'cost', 'p', 'q', 'dice', 'outcome', 'notes']) {
    assert.ok(key in rush, key);
  }
  assert.equal(rush.ruleVersion, 'v0.3-T3');
  assert.deepEqual([rush.cost, rush.p, rush.q], [3, 60, 40]);
  assert.equal(rush.before.token, 18);
  assert.equal(rush.after.token, 15);
  const opening = s.events.find((e) => e.type === 'setAttributes');
  assert.deepEqual(opening.dice, [{ stream: 'card', index: 1, value: ['C1', 'C2', 'C5', 'C4'], designated: true }]);
});

test('R11 匯出稽核紀錄後重播：最終狀態深度相等（注入序列）', () => {
  const s = playedJ1();
  const log = exportAuditLog(s);
  assert.equal(log.ruleVersion, 'v0.3-T3');
  assert.equal(log.containsSecrets, true);
  const roundTrip = JSON.parse(JSON.stringify(log));
  assert.deepEqual(replay(roundTrip), s);
});

test('R11 種子模式整段操作（含錯誤與重送）重播後深度相等', () => {
  let s = createGame({ gameId: 'seeded', rng: { success: { seed: 11 }, defect: { seed: 22 }, card: { seed: 33 } } });
  s = ok(s, 'setAttributes', { template: 'analyst' });
  s = ok(s, 'chooseOpening', { cardIds: s.pendingDraft.candidates.slice(0, 2).map((c) => c.id) });
  s = ok(s, 'accept', { projectId: 'J1' });
  s = send(s, 'action', { action: 'repair', toggles: {} }).state; // 非法，錯誤也記錄
  for (let i = 0; i < 4 && s.phase !== 'ended'; i++) {
    if (s.phase === 'levelDraft') {
      s = ok(s, 'chooseDraft', { choice: { type: 'forfeit' } });
      continue;
    }
    const out = send(s, 'action', { action: 'implement', toggles: {} });
    s = out.state;
  }
  const replayed = replay(JSON.parse(JSON.stringify(exportAuditLog(s))));
  assert.deepEqual(replayed, s);
});

test('重播拒絕不同規則版本的紀錄', () => {
  const log = exportAuditLog(playedJ1());
  assert.throws(() => replay({ ...log, ruleVersion: 'v0.2' }), /規則版本/);
});
