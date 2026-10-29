// replay-integrity：stateVersion 與 operationId 防重送（R13）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, submit } from '../src/core/engine.js';
import { ok, gameOnly, injected, startedGame, patch } from './helpers.js';

function req(state, type, payload, operationId) {
  return { operationId, expectedStateVersion: state.stateVersion, type, ...payload };
}

// 送出一次、再原封不動重送一次：第二次回傳相同結果、狀態不變、不再扣費取骰。
function assertIdempotent(state, type, payload, label) {
  const r = req(state, type, payload, `dup-${label}`);
  const first = submit(state, r);
  assert.equal(first.result.ok, true, `${label} 第一次應成功：${JSON.stringify(first.result.error)}`);
  const second = submit(first.state, structuredClone(r));
  assert.equal(second.duplicate, true, `${label} 應判定為重送`);
  assert.deepEqual(second.result, first.result, `${label} 重送結果須相同`);
  assert.deepEqual(second.state, first.state, `${label} 重送不得改變任何狀態`);
  return first.state;
}

test('R11/R13 防重送涵蓋配點、開局選卡、接案、行動、交付、升級選擇、放棄、提前結算', () => {
  let s = createGame({ gameId: 'g', rng: injected({ success: [1, 1], defect: [100, 100], card: [['C1', 'C2', 'C5', 'C4'], ['C4', 'C5', 'C1']] }) });
  s = assertIdempotent(s, 'setAttributes', { template: 'balanced' }, 'setAttributes');
  s = assertIdempotent(s, 'chooseOpening', { cardIds: ['C5', 'C2'] }, 'chooseOpening');
  s = assertIdempotent(s, 'accept', { projectId: 'J1' }, 'accept');
  s = assertIdempotent(s, 'action', { action: 'rush', toggles: { C2: true } }, 'rush');
  assert.equal(s.token, 15, '只扣一次 3');
  assert.equal(s.rng.success.cursor, 1);
  assert.equal(s.rng.defect.cursor, 1);
  s = assertIdempotent(s, 'action', { action: 'implement', toggles: {} }, 'implement');
  assert.equal(s.projects.J1.progress, 4);
  const xpBefore = s.xp;
  s = assertIdempotent(s, 'action', { action: 'deliver', toggles: {} }, 'deliver');
  assert.equal(s.score, 2, '分數只加一次');
  assert.equal(s.xp, xpBefore + 3, 'XP 只加一次');
  s = assertIdempotent(s, 'chooseDraft', { choice: { type: 'take', cardId: 'C4' } }, 'chooseDraft');
  assert.equal(s.equipped.length, 3);
  s = assertIdempotent(s, 'accept', { projectId: 'J2' }, 'accept-J2');
  s = patch(s, (x) => { x.phase = 'turnStart'; x.turn += 1; x.turnWindow = { accepted: false, abandoned: false }; });
  s = assertIdempotent(s, 'abandon', {}, 'abandon');
  assert.equal(s.projects.J2.status, 'abandoned');
  const settle = patch(startedGame(), () => {});
  assertIdempotent(settle, 'earlySettle', {}, 'earlySettle');
});

test('雙擊確認：同一 operationId 連送兩次只產生一次結算與一筆事件', () => {
  const s = ok(startedGame({ success: [1], defect: [100] }), 'accept', { projectId: 'J1' });
  const r = req(s, 'action', { action: 'implement', toggles: {} }, 'double-click');
  const a = submit(s, r);
  const b = submit(a.state, r);
  assert.equal(b.state.events.filter((e) => e.operationId === 'double-click').length, 1);
  assert.equal(b.state.token, s.token - 3);
});

test('同一 operationId 不同內容 → 拒絕（operation_id_conflict），狀態不變', () => {
  const s = ok(startedGame({ success: [1], defect: [100] }), 'accept', { projectId: 'J1' });
  const a = submit(s, req(s, 'action', { action: 'rest', toggles: {} }, 'same-id'));
  const b = submit(a.state, { ...req(a.state, 'action', { action: 'implement', toggles: {} }, 'same-id') });
  assert.equal(b.result.ok, false);
  assert.equal(b.result.error.code, 'operation_id_conflict');
  assert.deepEqual(b.state, a.state);
});

test('R11/R13 過期 stateVersion → 拒絕（stale_state_version），不扣費、不取骰', () => {
  const s0 = ok(startedGame({ success: [1, 1], defect: [100, 100] }), 'accept', { projectId: 'J1' });
  const s1 = ok(s0, 'action', { action: 'rest', toggles: {} });
  const stale = submit(s1, { operationId: 'stale-1', expectedStateVersion: s0.stateVersion, type: 'action', action: 'implement', toggles: {} });
  assert.equal(stale.result.error.code, 'stale_state_version');
  assert.deepEqual(gameOnly(stale.state), gameOnly(s1));
  assert.equal(stale.state.rng.success.cursor, 0);
});

test('錯誤結果也快取：非法請求重送仍回相同錯誤，即使狀態之後變得合法也不重新執行', () => {
  const s0 = patch(ok(startedGame({ success: [1], defect: [100] }), 'accept', { projectId: 'J1' }), (x) => { x.token = 2; });
  const r = req(s0, 'action', { action: 'implement', toggles: {} }, 'cached-error');
  const first = submit(s0, r);
  assert.equal(first.result.error.code, 'insufficient_token');
  const richer = patch(first.state, (x) => { x.token = 18; });
  const again = submit(richer, r);
  assert.equal(again.duplicate, true);
  assert.deepEqual(again.result, first.result);
  assert.equal(again.state.token, 18);
  assert.equal(again.state.rng.success.cursor, 0);
});

test('成功轉移使 stateVersion +1；錯誤不增加', () => {
  const s0 = startedGame();
  const s1 = ok(s0, 'accept', { projectId: 'J1' });
  assert.equal(s1.stateVersion, s0.stateVersion + 1);
  const bad = submit(s1, req(s1, 'accept', { projectId: 'J2' }, 'v-bad'));
  assert.equal(bad.state.stateVersion, s1.stateVersion);
});

test('缺 operationId 的請求不快取、不改狀態', () => {
  const s0 = startedGame();
  const out = submit(s0, { expectedStateVersion: s0.stateVersion, type: 'earlySettle' });
  assert.equal(out.result.error.code, 'invalid_request');
  assert.equal(out.state, s0);
});
