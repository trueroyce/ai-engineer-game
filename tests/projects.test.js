// project-lifecycle：回合開始窗口（提前結算 → 放棄 → 接案）、一次一案、每案只接一次（R03/R10）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok, fail, gameOnly, startedGame, patch } from './helpers.js';

test('R03 開局三案全部公開且未接，玩家不必先接 J1', () => {
  const s = startedGame();
  assert.deepEqual(Object.values(s.projects).map((p) => [p.projectId, p.status]), [['J1', 'unaccepted'], ['J2', 'unaccepted'], ['J3', 'unaccepted']]);
  const j3 = ok(s, 'accept', { projectId: 'J3' });
  assert.equal(j3.activeProject, 'J3');
});

test('接案：設為進行中，P0/H0/K0/B0/N0/案齡 0，窗口進入行動選擇', () => {
  const s = ok(startedGame(), 'accept', { projectId: 'J1' });
  assert.equal(s.activeProject, 'J1');
  const p = s.projects.J1;
  assert.deepEqual([p.status, p.progress, p.hiddenDefects, p.knownDefects, p.preparationBonus, p.preparationUses, p.age], ['active', 0, 0, 0, 0, 0, 0]);
  assert.equal(s.phase, 'actionSelection');
});

test('一次一案：已有進行中 J1 時直接接 J3 → 拒絕', () => {
  let s = ok(startedGame(), 'accept', { projectId: 'J1' });
  s = patch(s, (x) => { x.phase = 'turnStart'; x.turnWindow = { accepted: false, abandoned: false }; });
  fail(s, 'accept', { projectId: 'J3' }, 'project_active');
});

test('接不存在的案 → 拒絕', () => {
  fail(startedGame(), 'accept', { projectId: 'J9' }, 'project_unavailable');
});

test('放棄：免費、S+1、清 P/H/K/B/N，狀態已放棄；同窗口可再接另一未接案', () => {
  let s = ok(startedGame(), 'accept', { projectId: 'J1' });
  s = patch(s, (x) => {
    x.phase = 'turnStart';
    x.turn = 2;
    x.turnWindow = { accepted: false, abandoned: false };
    Object.assign(x.projects.J1, { progress: 3, hiddenDefects: 1, knownDefects: 1, preparationBonus: 20, preparationUses: 2, age: 1 });
  });
  const tokenBefore = s.token;
  s = ok(s, 'abandon');
  const p = s.projects.J1;
  assert.deepEqual([p.status, p.progress, p.hiddenDefects, p.knownDefects, p.preparationBonus, p.preparationUses], ['abandoned', 0, 0, 0, 0, 0]);
  assert.equal(s.stress, 1);
  assert.equal(s.token, tokenBefore);
  assert.equal(s.activeProject, null);
  assert.equal(s.phase, 'turnStart');
  s = ok(s, 'accept', { projectId: 'J2' });
  assert.equal(s.activeProject, 'J2');
  assert.equal(s.phase, 'actionSelection');
});

test('每案只接一次：已放棄的 J2 不能再接', () => {
  let s = ok(startedGame(), 'accept', { projectId: 'J2' });
  s = patch(s, (x) => { x.phase = 'turnStart'; x.turn = 2; x.turnWindow = { accepted: false, abandoned: false }; });
  s = ok(s, 'abandon');
  fail(s, 'accept', { projectId: 'J2' }, 'project_unavailable');
});

test('已交付或逾期的案不能再接', () => {
  for (const status of ['delivered', 'expired']) {
    const s = patch(startedGame(), (x) => { x.projects.J1.status = status; });
    fail(s, 'accept', { projectId: 'J1' }, 'project_unavailable');
  }
});

test('R10 S9 放棄 → S10 立即崩潰；不得再接案或行動', () => {
  let s = ok(startedGame(), 'accept', { projectId: 'J1' });
  s = patch(s, (x) => { x.phase = 'turnStart'; x.turn = 2; x.turnWindow = { accepted: false, abandoned: false }; x.stress = 9; });
  s = ok(s, 'abandon');
  assert.equal(s.stress, 10);
  assert.equal(s.phase, 'ended');
  assert.equal(s.endReason, 'crash');
  assert.equal(s.ending.name, '壓力崩潰');
  fail(s, 'accept', { projectId: 'J2' }, 'game_ended');
});

test('接案後同回合不可放棄：拒絕，J2 仍進行中，壓力、Token 與三游標不變', () => {
  const s = ok(startedGame(), 'accept', { projectId: 'J2' });
  const out = fail(s, 'abandon', {}, 'abandon_after_accept');
  assert.deepEqual(gameOnly(out.state), gameOnly(s));
  assert.equal(out.state.activeProject, 'J2');
  assert.deepEqual(out.state.rng, s.rng);
});

test('沒有進行中專案時放棄 → 拒絕', () => {
  fail(startedGame(), 'abandon', {}, 'no_active_project');
});

test('R10 提前結算：只在回合開始窗口最前面；列出未交付案（含 P 已滿者），不自動交付', () => {
  let s = ok(startedGame(), 'accept', { projectId: 'J1' });
  s = patch(s, (x) => {
    x.phase = 'turnStart';
    x.turn = 5;
    x.turnWindow = { accepted: false, abandoned: false };
    x.projects.J1.progress = 4;
    x.score = 0;
  });
  const out = ok(s, 'earlySettle');
  assert.equal(out.phase, 'ended');
  assert.equal(out.endReason, 'earlySettle');
  assert.equal(out.score, 0);
  assert.equal(out.ending.name, '交件落空');
  assert.equal(out.projects.J1.status, 'active');
  const ev = out.events.at(-1);
  assert.deepEqual(ev.outcome.undelivered, [{ projectId: 'J1', status: 'active', progress: 4, target: 4, progressFull: true }]);
});

test('提前結算依已交付分數給結局', () => {
  const s = patch(startedGame(), (x) => { x.score = 6; x.projects.J1.status = 'delivered'; x.projects.J2.status = 'delivered'; });
  assert.equal(ok(s, 'earlySettle').ending.name, '穩定交付');
});

test('窗口順序：放棄或接案之後不能再提前結算', () => {
  const accepted = ok(startedGame(), 'accept', { projectId: 'J1' });
  fail(accepted, 'earlySettle', {}, 'wrong_phase');
  let s = patch(accepted, (x) => { x.phase = 'turnStart'; x.turn = 2; x.turnWindow = { accepted: false, abandoned: false }; });
  s = ok(s, 'abandon');
  fail(s, 'earlySettle', {}, 'window_order');
});

test('接案後窗口關閉：同回合不能再接別的案', () => {
  const s = ok(startedGame(), 'accept', { projectId: 'J1' });
  fail(s, 'accept', { projectId: 'J2' }, 'wrong_phase');
});
