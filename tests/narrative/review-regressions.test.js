import test from 'node:test';
import assert from 'node:assert/strict';
import { createNarrativeGame, decideEnding, isFullyVerified, performAction } from '../../src/narrative/engine.js';

let operation = 0;
const act = (state, actionId, extra = {}) => performAction(state, actionId, {
  operationId: `review-${++operation}`,
  stateVersion: state.stateVersion,
  ...extra,
});

test('artifact revision 改變後 A08 真正重驗，不回舊 A08-B cache', () => {
  let state = createNarrativeGame({ seed: 'review-cache' });
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  state = act(state, 'A08', { designate: 'A08-B' }).state;
  state = act(state, 'A07', { designate: 'A07-A', target: 'persistence' }).state;
  const before = { token: state.token, work: state.workCount };
  const recheck = act(state, 'A08');
  assert.equal(recheck.cached, false);
  assert.equal(recheck.result.event.id, 'A08-A');
  assert.ok(recheck.state.token < before.token);
  assert.equal(recheck.state.workCount, before.work + 1);
  assert.equal(isFullyVerified(recheck.state), true);
});

test('A09 不把 R1 顯示缺陷改寫成 R3 重複刪除缺陷', () => {
  let state = createNarrativeGame({ seed: 'review-identity' });
  state = act(state, 'A05', { designate: 'A05-B' }).state;
  const reviewed = act(state, 'A09');
  assert.notEqual(reviewed.result.event.id, 'A09-A');
  assert.equal(reviewed.state.functionState.R1, 'defective');
  assert.equal(reviewed.state.functionState.R3, 'not_implemented');
  assert.equal(reviewed.state.knownIssues.some((issue) => issue.code === 'duplicate-delete'), false);
  assert.throws(() => act(state, 'A09', { designate: 'A09-A' }), /不合法/);
});

test('A09 定向重現只揭露既有 R3 缺陷，不製造新的功能真值', () => {
  let state = createNarrativeGame({ seed: 'review-targeted' });
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  state = act(state, 'A07', { designate: 'A07-C', target: 'persistence' }).state;
  const before = structuredClone(state.functionState);
  const reviewed = act(state, 'A09');
  assert.equal(reviewed.result.event.id, 'A09-A');
  assert.deepEqual(reviewed.state.functionState, before);
  assert.equal(reviewed.state.evidence.R3.result, 'fail');
});

test('A11-C 回復 checkpoint 真值並建立新 revision，但不退時間或 Token', () => {
  let state = createNarrativeGame({ seed: 'review-rollback' });
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  const checkpointTruth = structuredClone(state.functionState);
  state = act(state, 'A07', { designate: 'A07-C', target: 'persistence' }).state;
  const before = { token: state.token, work: state.workCount, revision: state.artifact.revision };
  state = act(state, 'A11', { designate: 'A11-C', mode: 'rollback' }).state;
  assert.deepEqual(state.functionState, checkpointTruth);
  assert.equal(state.token, before.token - 2);
  assert.equal(state.workCount, before.work + 1);
  assert.ok(state.artifact.revision > before.revision);
  assert.equal(state.rollbackAvailable, false);
});

test('prototype 即使被注入全 pass 證據也不能正式交付；A05 不降級 implementation', () => {
  let prototype = createNarrativeGame({ seed: 'review-formal-prototype' });
  prototype.artifact.kind = 'prototype'; prototype.artifact.revision = 3;
  for (const id of Object.keys(prototype.functionState)) {
    prototype.functionState[id] = 'correct';
    prototype.evidence[id] = { requirementId: id, artifactRevision: 3, result: 'pass' };
  }
  assert.equal(isFullyVerified(prototype), true);
  assert.equal(decideEnding(prototype, 'formal'), null);

  let implementation = createNarrativeGame({ seed: 'review-no-downgrade' });
  implementation = act(implementation, 'A01', { designate: 'A01-A' }).state;
  implementation = act(implementation, 'A07', { designate: 'A07-A', target: 'persistence' }).state;
  implementation = act(implementation, 'A05', { designate: 'A05-A' }).state;
  assert.equal(implementation.artifact.kind, 'implementation');
});

test('A07-B 只適用完成語義 core 目標，不污染 persistence', () => {
  let state = createNarrativeGame({ seed: 'review-target' });
  state = act(state, 'A05', { designate: 'A05-A' }).state;
  state.requirement.clarity = 'ambiguous';
  assert.throws(() => act(state, 'A07', { designate: 'A07-B', target: 'persistence' }), /不合法/);
  const core = act(state, 'A07', { designate: 'A07-B', target: 'core' }).state;
  assert.equal(core.functionState.R2, 'defective');
  assert.equal(core.knownIssues.some((issue) => issue.code === 'completion-removes-item'), true);
});
