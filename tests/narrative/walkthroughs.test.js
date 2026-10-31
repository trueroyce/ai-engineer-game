import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrativeGame, performAction, rest, safeForTrial } from '../../src/narrative/engine.js';

let operation = 0;
function noCardGame(seed) {
  const state = createNarrativeGame({ seed });
  state.cards = {};
  state.equipped = [];
  return state;
}
function step(state, actionId, designate, extra = {}) {
  return performAction(state, actionId, {
    operationId: `walk-${++operation}`,
    stateVersion: state.stateVersion,
    designate,
    ...extra,
  }).state;
}
function finish(state, intent) {
  return performAction(state, 'A12', {
    operationId: `walk-${++operation}`,
    stateVersion: state.stateVersion,
    intent,
  }).state;
}
function takeRest(state) {
  return rest(state, { operationId: `walk-${++operation}`, stateVersion: state.stateVersion }).state;
}

test('核准走查 E01：六次工作、全證據、期限內正式交付', () => {
  let s = noCardGame('walk-e01');
  s = step(s, 'A01', 'A01-A');
  s = step(s, 'A04', 'A04-A');
  s = step(s, 'A05', 'A05-A');
  s = step(s, 'A07', 'A07-A', { target: 'persistence' });
  s = step(s, 'A08', 'A08-A');
  s = step(s, 'A09', 'A09-C');
  assert.equal(s.workCount, 6);
  assert.equal(s.token, 11);
  s = finish(s, 'formal');
  assert.equal(s.ending.id, 'E01');
});

test('核准走查 E04：核心可用、保存失敗，只能誠實有限試用', () => {
  let s = noCardGame('walk-e04');
  s = step(s, 'A01', 'A01-D');
  s = step(s, 'A03', 'A03-A');
  s = step(s, 'A01', 'A01-A', { newRevision: true });
  s = step(s, 'A05', 'A05-A');
  s = step(s, 'A08', 'A08-B');
  assert.equal(s.workCount, 5);
  assert.equal(s.token, 15);
  assert.equal(safeForTrial(s), true);
  const formal = finish(s, 'formal');
  assert.equal(formal.ending, null);
  s = finish(s, 'limited');
  assert.equal(s.ending.id, 'E04');
});

test('核准走查 E06：第十三次工作加班，全證據後才可遲交', () => {
  let s = noCardGame('walk-e06');
  s = step(s, 'A01', 'A01-B');
  s = step(s, 'A02', 'A02-C');
  s = step(s, 'A05', 'A05-A');
  s = step(s, 'A06', 'A06-C');
  s = step(s, 'A03', 'A03-A');
  s = step(s, 'A06', 'A06-A', { newRevision: true });
  s = step(s, 'A04', 'A04-B');
  s = step(s, 'A04', 'A04-A', { repairDraft: true });
  s = step(s, 'A07', 'A07-C', { target: 'persistence' });
  s = step(s, 'A09', 'A09-A');
  s = step(s, 'A11', 'A11-B', { mode: 'fix' });
  s = step(s, 'A11', 'A11-A', { mode: 'fix', repairDraft: true });
  s = step(s, 'A08', 'A08-A');
  assert.equal(s.workCount, 13);
  assert.equal(s.overtimeUsed, 1);
  assert.equal(s.token, 0);
  s = finish(s, 'formal');
  assert.equal(s.ending.id, 'E06');
});

test('E02 由範圍協商與完整證據的合法 action 路線到達', () => {
  let s = noCardGame('walk-e02');
  s = step(s, 'A01', 'A01-D');
  s = step(s, 'A03', 'A03-A');
  s = step(s, 'A01', 'A01-A', { newRevision: true });
  s = step(s, 'A04', 'A04-A');
  s = step(s, 'A05', 'A05-A');
  s = step(s, 'A07', 'A07-A', { target: 'persistence' });
  s = step(s, 'A08', 'A08-A');
  s = finish(s, 'formal');
  assert.equal(s.ending.id, 'E02');
});

test('E03 由真缺陷、修復與重驗的合法 action 路線到達', () => {
  let s = noCardGame('walk-e03');
  s = step(s, 'A01', 'A01-A');
  s = step(s, 'A04', 'A04-A');
  s = step(s, 'A05', 'A05-A');
  s = step(s, 'A07', 'A07-C', { target: 'persistence' });
  s = step(s, 'A09', 'A09-A');
  s = step(s, 'A11', 'A11-A', { mode: 'fix' });
  s = step(s, 'A08', 'A08-A');
  s = finish(s, 'formal');
  assert.equal(s.ending.id, 'E03');
});

test('E05、E07、E08 各由合法 action／休息／交付意圖路線到達', () => {
  let detour = noCardGame('walk-e05');
  detour = step(detour, 'A05', 'A05-C');
  assert.equal(detour.artifact.visualDetour, true);
  detour = finish(detour, 'showcase');
  assert.equal(detour.ending.id, 'E05');

  let late = noCardGame('walk-e07');
  late = step(late, 'A05', 'A05-C');
  for (let i = 0; i < 11; i += 1) late = takeRest(late);
  assert.equal(late.timeLeft, 0);
  late = finish(late, 'progress');
  assert.equal(late.ending.id, 'E07');

  let stopped = noCardGame('walk-e08');
  stopped = finish(stopped, 'stop');
  assert.equal(stopped.ending.id, 'E08');
});
