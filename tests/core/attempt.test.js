import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRequirementRevision, createAttemptState, eventWeights, payRetry, previewAttempt, previewRetry, resolveAttempt } from '../../src/core/attempt.js';

const request = (overrides = {}) => ({ operationId: 'op-1', semanticKey: 'contract', baseChance: 50, modifiers: [], events: [{ id: 'drift', weight: 40 }, { id: 'missing', weight: 30 }, { id: 'format', weight: 30 }], cards: {}, equipped: [], ...overrides });

test('success consumes only success draw; failure selects event afterward', () => {
  let eventCalls = 0;
  const success = resolveAttempt(createAttemptState(), request(), { success: () => 40, event: () => { eventCalls += 1; return 1; } });
  assert.equal(success.result.outcome, 'success'); assert.equal(eventCalls, 0);
  const failure = resolveAttempt(createAttemptState(), request(), { success: 90, event: () => { eventCalls += 1; return 1; } });
  assert.equal(failure.result.outcome, 'failure'); assert.equal(failure.result.failureEvent, 'drift'); assert.equal(eventCalls, 1);
});

test('partial and C14 near-miss are visible, bounded and consume card use once', () => {
  const partial = resolveAttempt(createAttemptState(), request({ partialMargin: 8 }), { success: 56, event: 1 });
  assert.equal(partial.result.outcome, 'partial');
  const boosted = resolveAttempt(createAttemptState(), request({ cards: { C14: 1 }, equipped: ['C14'] }), { success: 54, event: 1 });
  assert.equal(boosted.result.outcome, 'partial'); assert.equal(boosted.result.cardTrigger, 'C14'); assert.equal(boosted.state.cardUsage.C14, 1);
});

test('paid retries use +12/+8/+4/+2 with cap while reads do not mutate', () => {
  let state = createAttemptState(); const gains = [];
  for (let i = 0; i < 5; i += 1) { const paid = payRetry(state, { semanticKey: 'contract', token: 9, time: 9 }); state = paid.state; gains.push(paid.preview.learningGain); }
  assert.deepEqual(gains, [12, 8, 4, 2, 0]); assert.equal(state.learning.r1.contract, 26);
  const before = structuredClone(state); previewRetry(state, { semanticKey: 'contract' }); previewAttempt(state, request()); assert.deepEqual(state, before);
  assert.throws(() => payRetry(createAttemptState(), { semanticKey: 'x', token: 0, time: 0 }), /資源不足/);
});

test('C13 and requirements archaeologists synergy produce a real bounded retry bonus', () => {
  const paid = payRetry(createAttemptState(), { semanticKey: 'contract', token: 2, time: 2, cards: { C13: 2, C17: 1 }, equipped: ['C13', 'C17'] });
  assert.equal(paid.preview.learningGain, 20); assert.equal(paid.preview.timeCost, 0); assert.equal(paid.state.learning.r1.contract, 20);
});

test('only the most recent failure event is deweighted', () => {
  const base = [{ id: 'A', weight: 40 }, { id: 'B', weight: 30 }, { id: 'C', weight: 30 }];
  assert.deepEqual(eventWeights(base, 'A').map((event) => event.effectiveWeight), [10, 30, 30]);
  let state = createAttemptState();
  let first = resolveAttempt(state, request({ events: base }), { success: 99, event: 1 }); state = first.state; assert.equal(first.result.failureEvent, 'A');
  state.semanticVersions.contract = 1;
  let second = resolveAttempt(state, request({ operationId: 'op-2', events: base }), { success: 99, event: 11 }); state = second.state; assert.equal(second.result.failureEvent, 'B');
  assert.equal(state.recentFailures.contract, 'B'); assert.equal(eventWeights(base, state.recentFailures.contract)[0].effectiveWeight, 40);
});

test('repeated events increment sequel and C17 adds actual learning', () => {
  let state = createAttemptState();
  let first = resolveAttempt(state, request({ cards: { C17: 1 }, equipped: ['C17'] }), { success: 99, event: 1 }); state = first.state; assert.equal(first.result.sequel, 1);
  state.semanticVersions.contract = 1;
  let second = resolveAttempt(state, request({ operationId: 'op-2', cards: { C17: 1 }, equipped: ['C17'] }), { success: 99, event: 1 });
  assert.equal(second.result.failureEvent, 'drift'); assert.equal(second.result.sequel, 2); assert.equal(second.state.learning.r1.contract, 4);
});

test('minor and major revisions affect only named learning, event and evidence keys', () => {
  let state = createAttemptState(); state.learning.r1 = { contract: 20, tests: 12 }; state.retryCounts.r1 = { contract: 2, tests: 1 }; state.recentFailures = { contract: 'A', tests: 'B' }; state.evidence = { contract: { status: 'current' }, tests: { status: 'current' } };
  const minor = applyRequirementRevision(state, { revision: 'r2', kind: 'minor', affectedKeys: ['contract'] });
  assert.deepEqual(minor.learning.r2, { contract: 10, tests: 12 }); assert.equal(minor.recentFailures.tests, 'B'); assert.equal(minor.recentFailures.contract, undefined); assert.equal(minor.evidence.contract.status, 'needs-confirmation'); assert.equal(minor.evidence.tests.status, 'current');
  const major = applyRequirementRevision(minor, { revision: 'r3', kind: 'major', affectedKeys: ['contract'] });
  assert.equal(major.learning.r3.contract, 0); assert.equal(major.learning.r3.tests, 12); assert.equal(major.evidence.contract, undefined); assert.equal(major.evidence.tests.status, 'current');
});

test('operation and semantic caches prevent reroll and reject operation payload conflicts', () => {
  let calls = 0; const draws = { success: () => { calls += 1; return 99; }, event: () => { calls += 1; return 1; } };
  const first = resolveAttempt(createAttemptState(), request(), draws);
  const repeated = resolveAttempt(first.state, request(), draws);
  assert.equal(calls, 2); assert.equal(repeated.repeated, true); assert.deepEqual(repeated.result, first.result);
  assert.throws(() => resolveAttempt(first.state, request({ baseChance: 60 }), draws), /operation_id_conflict/);
  const semantic = resolveAttempt(first.state, request({ operationId: 'op-2' }), draws);
  assert.equal(calls, 2); assert.equal(semantic.repeated, true);
});
