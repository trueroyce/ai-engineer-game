import test from 'node:test';
import assert from 'node:assert/strict';
import { eventCount, EVENTS } from '../../src/narrative/content.js';
import { createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { ACTION_SCENES, EVENT_COPY } from '../../src/narrative/narrative-copy.js';

let op = 0;
const run = (state, actionId, extra = {}) => performAction(state, actionId, { operationId: `t-${++op}`, stateVersion: state.stateVersion, ...extra }).state;
const outcome = (state, actionId, extra = {}) => performAction(state, actionId, { operationId: `t-${++op}`, stateVersion: state.stateVersion, ...extra });

function prepared(action) {
  let s = createNarrativeGame({ seed: `for-${action}` });
  if (action === 'A02' || action === 'A04') s = run(s, 'A01', { designate: 'A01-B' });
  if (action === 'A03') s = run(s, 'A01', { designate: 'A01-D' });
  if (['A06', 'A07', 'A08', 'A09'].includes(action)) s = run(s, 'A05', { designate: 'A05-A' });
  if (action === 'A10') s.context.jobsSinceSummary = 3;
  if (action === 'A11') {
    s = run(s, 'A05', { designate: 'A05-A' });
    s = run(s, 'A07', { designate: 'A07-C', checkDelete: true });
  }
  return s;
}

test('內容表恰有 34 個內部事件，11 種工作各有事件', () => {
  assert.equal(eventCount(), 34);
  assert.deepEqual(Object.keys(EVENTS), ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11']);
});

test('核准稿完整匯入 12 組 CLI 演出與 34 段玩家事件正文', () => {
  assert.equal(Object.keys(ACTION_SCENES).length, 12);
  assert.equal(Object.keys(EVENT_COPY).length, 34);
  for (const scene of Object.values(ACTION_SCENES)) {
    assert.ok(scene.intro.length > 10);
    assert.ok(scene.transcript.length > 20);
  }
  for (const copy of Object.values(EVENT_COPY)) assert.ok(copy.story.length > 40);
});

test('玩家正文不含作者條件或內部 effect 欄位', () => {
  const playerCopy = JSON.stringify({ ACTION_SCENES, EVENT_COPY });
  for (const forbidden of ['作者條件：', '產物：', '狀態：', '後續：']) assert.equal(playerCopy.includes(forbidden), false);
});

for (const [action, events] of Object.entries(EVENTS)) {
  for (const expected of events) {
    test(`${expected.id} 可在合法前置下結算並留下敘事結果`, () => {
      let state = prepared(action);
      if (expected.id === 'A09-A') state = run(state, 'A07', { designate: 'A07-C', target: 'persistence' });
      const extra = expected.id === 'A11-C' ? { designate: expected.id, mode: 'rollback' }
        : expected.id === 'A07-B' ? { designate: expected.id, target: 'core' }
          : { designate: expected.id };
      const { state: next, result } = outcome(state, action, extra);
      assert.equal(result.event.id, expected.id);
      assert.ok(result.event.story.length > 20);
      assert.equal(next.workCount, state.workCount + 1);
      assert.equal(next.timeLeft, Math.max(0, state.timeLeft - 1));
      assert.ok(next.historyTags.includes(expected.id));
    });
  }
}

test('不合法指定事件明確拒絕，不從其他事件偷換', () => {
  const s = createNarrativeGame({ seed: 'illegal' });
  assert.throws(() => outcome(s, 'A02', { designate: 'A02-A' }), /沒有適用|不合法/);
});

test('文件真值與功能真值分離', () => {
  let s = createNarrativeGame({ seed: 'truth-doc' });
  s = run(s, 'A01', { designate: 'A01-B' });
  s = run(s, 'A02', { designate: 'A02-B' });
  assert.equal(s.documents.wrongCompletionRule, true);
  assert.equal(s.functionState.R2, 'not_implemented');
  assert.equal(s.knownIssues.length, 0);
});

test('版本改動使受影響的既有證據失效', () => {
  let s = createNarrativeGame({ seed: 'evidence' });
  s = run(s, 'A05', { designate: 'A05-A' });
  s = run(s, 'A08', { designate: 'A08-B' });
  assert.equal(s.evidence.R1.result, 'pass');
  s = run(s, 'A07', { designate: 'A07-C' });
  assert.equal(s.evidence.R3.result, 'not_run');
  assert.equal(s.evidence.R1.result, 'pass');
});
