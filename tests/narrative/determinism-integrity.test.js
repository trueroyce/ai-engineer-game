import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrativeGame, performAction, rest } from '../../src/narrative/engine.js';
import { auditView, projectNarrativeView } from '../../src/narrative/view.js';
import { exportNarrativeLog, replayNarrative } from '../../src/narrative/log.js';

function submit(state, actionId, n, extra = {}) {
  return performAction(state, actionId, { operationId: `op-${n}`, stateVersion: state.stateVersion, ...extra });
}

test('相同 seed 與事件鍵得到相同事件', () => {
  const a = submit(createNarrativeGame({ seed: 'same-seed' }), 'A01', 1);
  const b = submit(createNarrativeGame({ seed: 'same-seed' }), 'A01', 1);
  assert.equal(a.result.event.id, b.result.event.id);
});

test('同 operationId 同內容回快取，不再扣資源或給獎勵', () => {
  const first = submit(createNarrativeGame({ seed: 'idem' }), 'A01', 1, { designate: 'A01-A' });
  const again = performAction(first.state, 'A01', { operationId: 'op-1', stateVersion: first.state.stateVersion, designate: 'A01-A' });
  assert.equal(again.cached, true);
  assert.equal(again.state.token, first.state.token);
  assert.equal(again.state.workCount, first.state.workCount);
  assert.equal(again.state.xp, first.state.xp);
});

test('同 operationId 不同內容衝突，過期版本拒絕', () => {
  const first = submit(createNarrativeGame({ seed: 'conflict' }), 'A01', 1, { designate: 'A01-A' });
  assert.throws(() => performAction(first.state, 'A05', { operationId: 'op-1', stateVersion: first.state.stateVersion }), /衝突/);
  assert.throws(() => performAction(first.state, 'A05', { operationId: 'op-2', stateVersion: 0 }), /過期/);
});

test('同事件鍵不能靠換 operationId 重抽或重複收費', () => {
  const first = submit(createNarrativeGame({ seed: 'event-key' }), 'A01', 1, { designate: 'A01-A' });
  const again = submit(first.state, 'A01', 2);
  assert.equal(again.cached, true);
  assert.equal(again.state.token, first.state.token);
});

test('會改 artifact 或摘要 revision 的工作，仍須明示新輸入才可重做', () => {
  const prototype = submit(createNarrativeGame({ seed: 'mutating-key' }), 'A05', 11, { designate: 'A05-A' });
  const samePrototype = submit(prototype.state, 'A05', 12);
  assert.equal(samePrototype.cached, true);
  assert.equal(samePrototype.state.workCount, prototype.state.workCount);

  const context = createNarrativeGame({ seed: 'summary-key' });
  context.context.jobsSinceSummary = 3;
  const summary = submit(context, 'A10', 13, { designate: 'A10-A' });
  const sameSummary = submit(summary.state, 'A10', 14);
  assert.equal(sameSummary.cached, true);
  assert.equal(sameSummary.state.workCount, summary.state.workCount);
});

test('玩家視圖不洩漏真值、證據內部欄位、事件鍵或種子', () => {
  const state = createNarrativeGame({ seed: 'secret-seed' });
  const text = JSON.stringify(projectNarrativeView(state));
  for (const forbidden of ['functionState', 'eventKey', 'resolved', 'secret-seed', 'evidence']) assert.equal(text.includes(forbidden), false);
  assert.equal(auditView(state).seed, 'secret-seed');
});

test('休息消耗時間、恢復資源；壓力 10 不自動結束', () => {
  const s = createNarrativeGame({ seed: 'rest' });
  s.cards = {}; s.equipped = [];
  s.token = 10; s.stress = 10;
  const next = rest(s, { operationId: 'rest-1', stateVersion: 0 }).state;
  assert.equal(next.workCount, 1);
  assert.equal(next.token, 14);
  assert.equal(next.stress, 8);
  assert.equal(next.phase, 'playing');
});

test('重播紀錄保留小範圍選項、事件與最終狀態', () => {
  let state = createNarrativeGame({ seed: 'replay-options' });
  state = submit(state, 'A05', 21, { designate: 'A05-A' }).state;
  state = submit(state, 'A07', 22, { designate: 'A07-A', target: 'delete' }).state;
  const log = exportNarrativeLog(state);
  const replayed = replayNarrative(log);
  assert.equal(replayed.artifact.revision, state.artifact.revision);
  assert.deepEqual(replayed.functionState, state.functionState);
  assert.equal(replayed.token, state.token);
  assert.deepEqual(replayed.historyTags, state.historyTags);
});
