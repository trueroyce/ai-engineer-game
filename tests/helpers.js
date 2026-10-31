// 測試共用：自動帶 operationId 與 expectedStateVersion 的提交輔助。
import assert from 'node:assert/strict';
import { createGame, submit } from '../src/core/engine.js';

let counter = 0;
export function nextOpId(prefix = 'op') {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function send(state, type, payload = {}, extra = {}) {
  const request = { operationId: nextOpId(type), expectedStateVersion: state.stateVersion, type, ...payload, ...extra };
  const out = submit(state, request);
  return { ...out, request };
}

export function ok(state, type, payload = {}) {
  const out = send(state, type, payload);
  assert.equal(out.result.ok, true, `${type} 應成功：${JSON.stringify(out.result.error)}`);
  return out.state;
}

export function fail(state, type, payload = {}, code) {
  const out = send(state, type, payload);
  assert.equal(out.result.ok, false, `${type} 應被拒絕`);
  if (code) assert.equal(out.result.error.code, code);
  return out;
}

// 除去操作快取與請求紀錄後的遊戲狀態，用來斷言「狀態不變」。
export function gameOnly(state) {
  const { operationResults, log, ...rest } = state;
  return rest;
}

export function injected({ success = [], defect = [], card = [] } = {}) {
  return { success: { values: success }, defect: { values: defect }, card: { values: card } };
}

// 建局 → 配點 → 開局選卡，回傳第 1 回合開始的狀態。
export function startedGame({ attributes = { A: 2, E: 2, V: 2 }, opening = ['C1', 'C2', 'C5', 'C4'], pick = ['C5', 'C2'], success = [], defect = [], levelDrafts = [] } = {}) {
  let s = createGame({ gameId: 'test', rng: injected({ success, defect, card: [opening, ...levelDrafts] }) });
  s = ok(s, 'setAttributes', { attributes });
  s = ok(s, 'chooseOpening', { cardIds: pick });
  return s;
}

// 直接改寫狀態（只供建構邊界局面；不經過引擎合法性）。
export function patch(state, fn) {
  const s = structuredClone(state);
  fn(s);
  return s;
}
