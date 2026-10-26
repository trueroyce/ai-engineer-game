import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNarrativeGame,
  decideEnding,
  isEvidenceCurrent,
  performAction,
  previewAction,
  readPreviousActionResult,
  reviewCoveragePercent,
} from '../../src/narrative/engine.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { renderPreview } from '../../src/narrative-ui/render.js';

let operation = 0;
function act(state, actionId, options = {}) {
  operation += 1;
  return performAction(state, actionId, {
    ...options,
    operationId: `round2-${operation}`,
    stateVersion: state.stateVersion,
  });
}

test('unchecked UI booleans and omitted semantic defaults share event and cache identity', () => {
  let state = createNarrativeGame({ seed: 'round2-option-normalization' });
  const first = act(state, 'A05', { useC2: false });
  state = first.state;
  const again = act(state, 'A05');
  assert.equal(again.cached, true);
  assert.equal(again.result.event.id, first.result.event.id);

  state = act(state, 'A07', { target: 'persistence', useC2: false }).state;
  const repeatedDefault = act(state, 'A07');
  assert.equal(repeatedDefault.cached, true);
});

test('不相關 artifact 工作不使同輸入 A01 重抽或扣費', () => {
  let state = createNarrativeGame({ seed: 'round2-cross-action' });
  const first = act(state, 'A01', { designate: 'A01-A' });
  state = first.state;
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  state = act(state, 'A08', { designate: 'A08-B' }).state;
  const before = { token: state.token, time: state.timeLeft, work: state.workCount, xp: state.xp };
  const again = act(state, 'A01');
  assert.equal(again.cached, true);
  assert.equal(again.result.event.id, first.result.event.id);
  assert.deepEqual(
    { token: again.state.token, time: again.state.timeLeft, work: again.state.workCount, xp: again.state.xp },
    before,
  );
});

test('summary revision 初始化且只影響摘要工作，不顛倒污染 A01 cache', () => {
  let state = createNarrativeGame({ seed: 'round2-summary' });
  state = act(state, 'A01', { designate: 'A01-A' }).state;
  state.context.jobsSinceSummary = 3;
  state = act(state, 'A10', { designate: 'A10-A' }).state;
  assert.equal(state.context.summaryRevision, 1);
  assert.equal(Number.isFinite(state.context.summaryRevision), true);
  assert.equal(act(state, 'A01').cached, true);
});

test('rollback 後 A05 付費重做、重用原事件、不重領里程碑', () => {
  let state = createNarrativeGame({ seed: 'round2-redo-a05' });
  const first = act(state, 'A05', { designate: 'A05-A' });
  state = first.state;
  const xpAfterFirst = state.xp;
  state = act(state, 'A11', { designate: 'A11-C', mode: 'rollback' }).state;
  assert.equal(state.artifact.kind, null);
  const before = { token: state.token, time: state.timeLeft, work: state.workCount };
  const redo = act(state, 'A05');
  assert.equal(redo.cached, false);
  assert.equal(redo.result.event.id, first.result.event.id);
  assert.equal(redo.state.artifact.kind, 'prototype');
  assert.ok(redo.state.token < before.token);
  assert.equal(redo.state.timeLeft, before.time - 1);
  assert.equal(redo.state.workCount, before.work + 1);
  assert.equal(redo.state.xp, xpAfterFirst);
});

test('rollback 後 A07 同 target 付費重做、重用原事件並重新套用效果', () => {
  let state = createNarrativeGame({ seed: 'round2-redo-a07' });
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  const first = act(state, 'A07', { designate: 'A07-C', target: 'persistence' });
  state = first.state;
  state = act(state, 'A11', { designate: 'A11-C', mode: 'rollback' }).state;
  assert.equal(state.functionState.R4, 'not_implemented');
  assert.equal(state.functionState.R5, 'not_implemented');
  const before = { token: state.token, work: state.workCount, xp: state.xp };
  const redo = act(state, 'A07', { target: 'persistence' });
  assert.equal(redo.cached, false);
  assert.equal(redo.result.event.id, first.result.event.id);
  assert.equal(redo.state.functionState.R4, 'correct');
  assert.equal(redo.state.functionState.R5, 'correct');
  assert.ok(redo.state.token < before.token);
  assert.equal(redo.state.workCount, before.work + 1);
  assert.equal(redo.state.xp, before.xp);
});

test('需求理解失敗後可付費重試，preview 與 execute 成本一致', () => {
  let state = createNarrativeGame({ seed: 'round2-preview' });
  state = act(state, 'A01', { designate: 'A01-B' }).state;
  assert.deepEqual(previewAction(state, 'A01'), { cached: false, cost: 2, overtime: false });
  assert.deepEqual(previewAction(state, 'A01', { newRevision: true }), { cached: false, cost: 2, overtime: false });
  const view = projectNarrativeView(state);
  const retry = renderPreview(view, 'A01', {}, previewAction(state, 'A01'));
  assert.doesNotMatch(retry, /工作對象沒有改變/);
  assert.match(retry, /2 Token、一次工作時間/);
  assert.match(retry, />確認執行</);
  const paidOptions = { newRevision: true };
  const paid = renderPreview(view, 'A01', paidOptions, previewAction(state, 'A01', paidOptions));
  assert.doesNotMatch(paid, /工作對象沒有改變/);
  assert.match(paid, /2 Token、一次工作時間/);
  assert.match(paid, />確認執行</);
});

test('A09 覆蓋率使用 1–10 量尺公式與 C3 加成', () => {
  const base = createNarrativeGame({ seed: 'round2-coverage', attrs: { A: 1, E: 2, V: 3 } });
  assert.equal(reviewCoveragePercent(base), 51.5);
  base.stress = 8;
  assert.equal(reviewCoveragePercent(base), 39.5);
  base.cards.C3 = 1;
  base.equipped.push('C3');
  assert.equal(reviewCoveragePercent(base, { useC3: true }), 59.5);
  base.cards.C3 = 2;
  assert.equal(reviewCoveragePercent(base, { useC3: true }), 74.5);
});

test('A09 coverage 可揭露既存隱藏 R3 缺陷，但不會製造缺陷', () => {
  let discovered = false;
  let missed = false;
  for (let i = 0; i < 300 && !(discovered && missed); i += 1) {
    let hidden = createNarrativeGame({ seed: `round2-hidden-${i}` });
    hidden.artifact = { ...hidden.artifact, kind: 'implementation', revision: 1 };
    hidden.functionState.R3 = 'defective';
    const result = act(hidden, 'A09');
    if (result.result.event.id === 'A09-A') {
      discovered = true;
      assert.equal(result.state.knownIssues.some((issue) => issue.code === 'duplicate-delete'), true);
    } else {
      missed = true;
      assert.equal(result.state.knownIssues.some((issue) => issue.code === 'duplicate-delete'), false);
    }
  }
  assert.equal(discovered, true);
  assert.equal(missed, true);

  const clean = createNarrativeGame({ seed: 'round2-clean-review' });
  clean.artifact = { ...clean.artifact, kind: 'implementation', revision: 1 };
  clean.functionState.R3 = 'correct';
  const reviewed = act(clean, 'A09');
  assert.notEqual(reviewed.result.event.id, 'A09-A');
  assert.equal(reviewed.state.functionState.R3, 'correct');
  assert.equal(reviewed.state.knownIssues.some((issue) => issue.code === 'duplicate-delete'), false);
});

test('可可靠界定的 A07 小範圍修改只使受影響證據待重驗', () => {
  const state = createNarrativeGame({ seed: 'round2-scoped-evidence' });
  state.artifact = { ...state.artifact, kind: 'implementation', revision: 1 };
  for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']) {
    state.functionState[id] = 'correct';
    state.evidence[id] = { requirementId: id, artifactRevision: 1, result: 'pass', source: 'test' };
  }
  const changed = act(state, 'A07', { designate: 'A07-A', target: 'persistence' }).state;
  for (const id of ['R1', 'R2', 'R3', 'R6']) assert.equal(isEvidenceCurrent(changed, id), true, `${id} should carry forward`);
  for (const id of ['R4', 'R5']) assert.equal(isEvidenceCurrent(changed, id), false, `${id} should require re-verification`);
  const progress = projectNarrativeView(changed).progress;
  assert.equal(progress.checks.filter((check) => check.status === '已驗證').length, 4);
  assert.equal(progress.checks.filter((check) => check.status.includes('內容已變更')).length, 2);
});

test('驗收文件確認與客戶待答假設在進度文案中明確區分', () => {
  const state = createNarrativeGame({ seed: 'round2-confirmed-assumptions' });
  state.documents.draft = true;
  state.documents.confirmed = true;
  const progress = projectNarrativeView(state).progress;
  assert.match(progress.documentText, /驗收文件已確認/);
  assert.match(progress.documentText, /3 個等待客戶回答的假設/);
  state.requirement.pendingQuestions = [];
  assert.equal(projectNarrativeView(state).progress.documentText, '驗收文件與客戶答案均已確認');
});

test('two failed document recoveries remain paid retryable work, then can recover and deliver formally', () => {
  let state = createNarrativeGame({ seed: 'round2-document-recovery-chain' });
  state = act(state, 'A01', { designate: 'A01-A' }).state;
  state = act(state, 'A04', { designate: 'A04-B' }).state;

  let action = projectNarrativeView(state).primaryActions.find((item) => item.id === 'A04');
  assert.equal(action?.canStart, true);
  assert.match(action?.hint ?? '', /已知誤解/);
  assert.deepEqual(previewAction(state, 'A04', { repairDraft: true }), { cached: false, cost: 2, overtime: false });

  state = act(state, 'A04', { designate: 'A04-C', repairDraft: true }).state;
  action = projectNarrativeView(state).primaryActions.find((item) => item.id === 'A04');
  assert.equal(action?.canStart, true, 'a second failed recovery must not disappear');
  assert.equal(state.requirement.pendingQuestions.length, 0);
  assert.match(readPreviousActionResult(state, 'A04').event.summary, /文件仍未確認/);
  assert.doesNotMatch(readPreviousActionResult(state, 'A04').event.summary, /未回答的問題仍然存在/);

  const beforeHistory = structuredClone(state);
  const saved = readPreviousActionResult(state, 'A04');
  assert.ok(saved);
  assert.deepEqual(state, beforeHistory, 'reading failed recovery history is pure');
  assert.deepEqual(previewAction(state, 'A04', { repairDraft: true }), { cached: false, cost: 2, overtime: false });

  state = act(state, 'A04', { designate: 'A04-A', repairDraft: true }).state;
  assert.equal(state.documents.confirmed, true);
  assert.equal(state.documents.wrongCompletionRule, false);
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  state = act(state, 'A07', { designate: 'A07-A', target: 'persistence' }).state;
  state = act(state, 'A08', { designate: 'A08-A' }).state;
  assert.equal(decideEnding(state, 'formal'), 'E01');
});
