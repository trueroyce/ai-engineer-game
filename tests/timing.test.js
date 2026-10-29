// project-lifecycle：回合精確時序（崩潰 → 交付關案 → 升級 → 案齡/逾期 → 崩潰 → 期限）（R03/R07/R10）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok, fail, startedGame, patch } from './helpers.js';

const POOL3 = ['C1', 'C3', 'C4'];
function withProject(id, { success = [], defect = [], levelDrafts = [POOL3, POOL3], setup = () => {} } = {}) {
  return patch(ok(startedGame({ success, defect, levelDrafts }), 'accept', { projectId: id }), setup);
}
const act = (s, action, toggles = {}) => ok(s, 'action', { action, toggles });

test('案齡：接案當回合主要行動計為案齡 1（第 4 回合接 J2 並休息 → 回合結束案齡 1、進入第 5 回合）', () => {
  let s = patch(startedGame(), (x) => { x.turn = 4; });
  s = ok(s, 'accept', { projectId: 'J2' });
  s = act(s, 'rest');
  assert.equal(s.projects.J2.age, 1);
  assert.equal(s.turn, 5);
  assert.equal(s.phase, 'turnStart');
  assert.deepEqual(s.turnWindow, { accepted: false, abandoned: false });
});

test('休息、分析、交付失敗都計案齡；工期不可暫停', () => {
  let s = withProject('J1', { success: [100] });
  s = act(s, 'analyze');
  assert.equal(s.projects.J1.age, 1);
  s = act(s, 'rest');
  assert.equal(s.projects.J1.age, 2);
});

test('逾期：案齡達工期且未交付 → 逾期關案、S+1，之後無進行中專案', () => {
  const s = act(withProject('J1', { setup: (x) => { x.projects.J1.age = 5; x.turn = 6; x.stress = 2; } }), 'rest');
  assert.equal(s.projects.J1.status, 'expired');
  assert.equal(s.activeProject, null);
  assert.equal(s.stress, 0 + 1, '休息 S2→0 後逾期 +1');
  assert.ok(s.events.at(-1).notes.some((n) => n.kind === 'expired' && n.projectId === 'J1'));
});

test('R03/R10 最後一動作修復成功：J2 第 8 動作修復 → 回合結束逾期、S+1，不自動交付', () => {
  const s = act(withProject('J2', { success: [1], setup: (x) => {
    x.turn = 11; x.stress = 7;
    Object.assign(x.projects.J2, { age: 7, progress: 6, knownDefects: 1, halfXpGranted: true, fullXpGranted: true });
  } }), 'repair');
  assert.equal(s.projects.J2.knownDefects, 0);
  assert.equal(s.projects.J2.status, 'expired');
  assert.equal(s.stress, 9, '修復 +1、逾期 +1');
  assert.equal(s.score, 0);
});

test('R03/R07/R10 最後一動作交付成功：J1 第 6 動作交付且 H=0 → 已交付並領獎，不加逾期壓力', () => {
  const s = act(withProject('J1', { setup: (x) => {
    x.turn = 6; x.stress = 3;
    Object.assign(x.projects.J1, { age: 5, progress: 4, halfXpGranted: true, fullXpGranted: true, qualityXpGranted: true });
  } }), 'deliver');
  assert.equal(s.projects.J1.status, 'delivered');
  assert.equal(s.score, 2);
  assert.equal(s.stress, 3);
  assert.equal(s.projects.J1.age, 5, '交付成功後不再處理案齡');
});

test('升級後仍逾期：最後工期動作使 XP 跨門檻但未交付 → 先完成抽選，之後逾期；已得 XP 保留', () => {
  let s = withProject('J1', { success: [1], setup: (x) => {
    x.turn = 6; x.xp = 2;
    Object.assign(x.projects.J1, { age: 5, progress: 4, halfXpGranted: true, fullXpGranted: true });
  } });
  s = act(s, 'verify');
  assert.equal(s.phase, 'levelDraft');
  assert.equal(s.projects.J1.status, 'active', '抽選完成前尚未處理逾期');
  assert.equal(s.turn, 6);
  s = ok(s, 'chooseDraft', { choice: { type: 'forfeit' } });
  assert.equal(s.projects.J1.status, 'expired');
  assert.deepEqual([s.xp, s.level], [3, 2]);
  assert.equal(s.turn, 7);
});

test('S=9 時普通實作使 P 滿且 S=10 → 立即崩潰：不交付、不觸發升級抽選、不處理逾期', () => {
  const s = act(withProject('J1', { success: [1], defect: [100], setup: (x) => {
    x.stress = 9; x.xp = 2;
    Object.assign(x.projects.J1, { progress: 3, age: 5, halfXpGranted: true });
  } }), 'implement');
  assert.equal(s.phase, 'ended');
  assert.equal(s.endReason, 'crash');
  assert.equal(s.ending.name, '壓力崩潰');
  assert.equal(s.projects.J1.progress, 4);
  assert.equal(s.projects.J1.status, 'active');
  assert.equal(s.pendingDraft, null);
  assert.equal(s.rng.card.cursor, 1, '崩潰不抽升級候選');
  assert.equal(s.projects.J1.age, 5, '崩潰後不再處理案齡');
  fail(s, 'action', { action: 'rest', toggles: {} }, 'game_ended');
});

test('退件 S+1 也立即檢查崩潰', () => {
  const s = act(withProject('J1', { setup: (x) => {
    x.stress = 9;
    Object.assign(x.projects.J1, { progress: 4, hiddenDefects: 1 });
  } }), 'deliver');
  assert.equal(s.endReason, 'crash');
});

test('逾期 S+1 後再次檢查崩潰', () => {
  const s = act(withProject('J1', { success: [100], setup: (x) => {
    x.stress = 9; x.turn = 6;
    Object.assign(x.projects.J1, { age: 5, progress: 4, knownDefects: 1 });
  } }), 'verify');
  assert.equal(s.projects.J1.status, 'expired');
  assert.equal(s.stress, 10);
  assert.equal(s.endReason, 'crash');
});

test('R03/R07/R10 第 18 回合交付有效，之後正常期限結算，不存在第 19 回合', () => {
  const s = act(withProject('J1', { setup: (x) => {
    x.turn = 18; x.score = 4; x.projects.J2.status = 'delivered';
    Object.assign(x.projects.J1, { age: 2, progress: 4, halfXpGranted: true, fullXpGranted: true, qualityXpGranted: true });
    x.xp = 10; x.level = 4; // 已封頂，交付 +2 不再觸發抽選（原寫 XP7 會跨 9，屬測試設定錯誤）
  } }), 'deliver');
  assert.equal(s.score, 6);
  assert.equal(s.phase, 'ended');
  assert.equal(s.endReason, 'deadline');
  assert.equal(s.turn, 18);
  assert.equal(s.ending.name, '穩定交付');
});

test('第 18 回合交付跨門檻：先完成抽選再期限結算', () => {
  let s = withProject('J1', { setup: (x) => {
    x.turn = 18; x.xp = 0;
    Object.assign(x.projects.J1, { age: 2, progress: 4, halfXpGranted: true, fullXpGranted: true });
  } });
  s = act(s, 'deliver');
  assert.equal(s.phase, 'levelDraft');
  s = ok(s, 'chooseDraft', { choice: { type: 'forfeit' } });
  assert.equal(s.phase, 'ended');
  assert.equal(s.endReason, 'deadline');
  assert.equal(s.ending.name, '初階接案');
});

test('第 18 回合一般行動後到期結算；未交付案不計分', () => {
  const s = act(withProject('J3', { setup: (x) => { x.turn = 18; } }), 'rest');
  assert.equal(s.endReason, 'deadline');
  assert.equal(s.score, 0);
  assert.equal(s.ending.name, '交件落空');
});

test('只交付 J3（7 分）期限結算 → 穩定交付', () => {
  const s = act(patch(startedGame(), (x) => { x.turn = 18; x.score = 7; x.projects.J3.status = 'delivered'; }), 'rest');
  assert.equal(s.ending.name, '穩定交付');
});

test('期限到期與逾期同時：第 18 回合逾期壓力導致崩潰時，崩潰優先', () => {
  const s = act(withProject('J1', { setup: (x) => {
    x.turn = 18; x.stress = 9;
    Object.assign(x.projects.J1, { age: 5, progress: 4, knownDefects: 1 });
  } }), 'rest');
  // 休息 S9→6，逾期 +1 → 7，未崩潰 → 期限結算
  assert.equal(s.endReason, 'deadline');
  assert.equal(s.stress, 7);
  const crash = act(withProject('J1', { success: [100], setup: (x) => {
    x.turn = 18; x.stress = 9;
    Object.assign(x.projects.J1, { age: 5, progress: 4, knownDefects: 1 });
  } }), 'verify');
  assert.equal(crash.endReason, 'crash');
});

test('主要行動後不能額外接案或交付（回合已推進）', () => {
  const s = act(withProject('J1', { setup: (x) => { Object.assign(x.projects.J1, { progress: 4 }); } }), 'rest');
  assert.equal(s.turn, 2);
  assert.equal(s.phase, 'turnStart');
  assert.equal(s.events.filter((e) => e.type === 'action').length, 1);
});
