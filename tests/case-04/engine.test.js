import test from 'node:test';
import assert from 'node:assert/strict';
import { case04PublicView, chooseCase04Reward, createCase04Game, performCase04Action, previewCase04Action } from '../../src/case-04/engine.js';
import { renderCase04Preview } from '../../src/case-04/render.js';

function act(state, actionId, options = {}) {
  let next = performCase04Action(state, actionId, { ...options, operationId: `${actionId}-${state.stateVersion}-${Object.values(options).join('-')}`, stateVersion: state.stateVersion }).state;
  while (next.pendingReward) next = chooseCase04Reward(next, next.pendingReward.choices[0]).state;
  return next;
}

function reachCommitment(strategy, route, agentMode = 'sequential') {
  let state = createCase04Game({ templateId: 'balanced', seed: 404, eventRolls: Array(40).fill(1), progressionV2: true });
  state = act(state, 'D01', { method: 'reproduce' });
  state = act(state, 'D02', { strategy });
  if (strategy === 'rollback') state = act(state, 'D10', { compatibility: 'inspect' });
  state = act(state, 'D03', { agentMode });
  state = act(state, 'D04', { route });
  return state;
}

test('patch, investigation, refactor and rollback create different state and later named consequences', () => {
  const patch = reachCommitment('patch', 'freeze');
  const investigate = reachCommitment('investigate', 'improve');
  const refactor = reachCommitment('refactor', 'freeze');
  const rollback = reachCommitment('rollback', 'freeze');
  assert.equal(patch.story.pendingConsequence.id, 'patch-coupling');
  assert.equal(investigate.story.pendingConsequence.id, 'wrong-requirement');
  assert.equal(refactor.story.pendingConsequence.id, 'scheduler-gap');
  assert.equal(rollback.story.pendingConsequence.id, 'schema-drift');
  assert.equal(rollback.dataCompatibility, 'compatible');
  assert.equal(rollback.compatibilityDecision.status, 'decided');
  assert.notDeepEqual(case04PublicView(patch).issues, case04PublicView(investigate).issues);
});

test('C4 or C15 opens a bounded rescue route while cardless contain and repair remain available', () => {
  let cardless = reachCommitment('patch', 'freeze');
  cardless = act(cardless, 'D05', { cause: 'code' });
  cardless = act(cardless, 'D07', { scope: 'full' });
  assert.doesNotMatch(renderCase04Preview(cardless, 'D06', {}), /value="isolate"/);
  assert.throws(() => performCase04Action(cardless, 'D06', { response: 'isolate', operationId: 'no-card-isolate', stateVersion: cardless.stateVersion }), /選擇處理方式/);
  assert.doesNotThrow(() => performCase04Action(cardless, 'D06', { response: 'contain', operationId: 'cardless-contain', stateVersion: cardless.stateVersion }));

  let withCard = createCase04Game({ templateId: 'balanced', cards: { C4: 1 }, equipped: ['C4'], eventRolls: Array(40).fill(1), progressionV2: true });
  withCard = act(withCard, 'D01', { method: 'reproduce' });
  withCard = act(withCard, 'D02', { strategy: 'patch' });
  withCard = act(withCard, 'D03', { agentMode: 'sequential' });
  withCard = act(withCard, 'D04', { route: 'freeze' });
  withCard = act(withCard, 'D05', { cause: 'code' });
  withCard = act(withCard, 'D07', { scope: 'full' });
  assert.match(renderCase04Preview(withCard, 'D06', {}), /value="isolate"/);
  const before = withCard.evidence.revision;
  withCard = act(withCard, 'D06', { response: 'isolate' });
  assert.equal(withCard.story.pendingConsequence.resolved, true);
  assert.equal(withCard.evidence.revision, before, 'card rescue preserves current evidence instead of rewriting the revision');
  assert.ok(withCard.issues.some((item) => item.id === 'patch-coupling-isolated' && item.status === 'open'));
});

test('C5 and C7 have visible Case 04 effects while cardless choices remain legal', () => {
  const withoutC7 = reachCommitment('investigate', 'freeze');
  let withC7 = createCase04Game({ templateId: 'balanced', cards: { C7: 2 }, equipped: ['C7'], eventRolls: Array(40).fill(1), progressionV2: true });
  withC7 = act(withC7, 'D01', { method: 'reproduce' });
  withC7 = act(withC7, 'D02', { strategy: 'investigate' });
  withC7 = act(withC7, 'D03', { agentMode: 'sequential' });
  withC7 = act(withC7, 'D04', { route: 'freeze' });
  const ordinaryRootCause = previewCase04Action(withoutC7, 'D05', { cause: 'code' });
  const contractedRootCause = previewCase04Action(withC7, 'D05', { cause: 'code' });
  assert.equal(contractedRootCause.token, ordinaryRootCause.token - 1);
  assert.ok(contractedRootCause.attempt.chance > ordinaryRootCause.attempt.chance);

  let withC5 = createCase04Game({ templateId: 'balanced', cards: { C5: 2 }, equipped: ['C5'], eventRolls: Array(40).fill(1), progressionV2: true });
  withC5 = act(withC5, 'D01', { method: 'reproduce' });
  withC5 = act(withC5, 'D02', { strategy: 'patch' });
  withC5 = act(withC5, 'D03', { agentMode: 'sequential' });
  assert.match(renderCase04Preview(withC5, 'D04', {}), /value="pace"/);
  const before = { token: withC5.token, stress: withC5.stress, time: withC5.timeLeft };
  withC5 = act(withC5, 'D04', { route: 'pace' });
  assert.equal(withC5.token, Math.min(24, before.token + 2));
  assert.equal(withC5.timeLeft, before.time - 1);
  assert.ok(withC5.stress <= before.stress);
  assert.equal(withC5.story.commitment, 'pace');
});

test('success offers freeze/improve, failure offers alternate/hard with real state changes', () => {
  const success = reachCommitment('refactor', 'improve');
  assert.equal(success.story.commitment, 'improve');
  assert.ok(success.issues.some((item) => item.id === 'extra-change'));

  let failure = createCase04Game({ templateId: 'beginner', eventRolls: Array(40).fill(100), progressionV2: true });
  failure = act(failure, 'D01', { method: 'logs' });
  failure = act(failure, 'D02', { strategy: 'patch' });
  failure = act(failure, 'D03', { agentMode: 'parallel' });
  assert.equal(failure.story.outcome, 'failure');
  failure = act(failure, 'D04', { route: 'alternate' });
  assert.equal(failure.service.stable, true);
  assert.ok(failure.issues.some((item) => item.id === 'limited-mode'));
});

test('early decision returns only after two later works and resolving it does not clear unrelated issues', () => {
  let state = reachCommitment('patch', 'freeze');
  assert.equal(state.story.pendingConsequence.revealed, false);
  state = act(state, 'D05', { cause: 'code' });
  assert.equal(state.story.followUpWork, 1);
  state = act(state, 'D07', { scope: 'full' });
  assert.equal(state.story.pendingConsequence.revealed, true);
  state.issues.push({ id: 'unrelated', text: '另一個公開問題', severity: 1, status: 'open', sourceRevision: state.revision });
  state = act(state, 'D06', { response: 'contain' });
  assert.equal(state.story.pendingConsequence.resolved, true);
  assert.equal(state.issues.find((item) => item.id === 'unrelated').status, 'open');
});

test('rollback requires a current compatibility decision before commitment or limited delivery', () => {
  let state = createCase04Game({ templateId: 'balanced', seed: 405, eventRolls: Array(40).fill(1), progressionV2: true });
  state = act(state, 'D01', { method: 'reproduce' });
  state = act(state, 'D02', { strategy: 'rollback' });
  assert.deepEqual(case04PublicView(state).availableActions.includes('D10'), true);
  assert.deepEqual(case04PublicView(state).availableActions.includes('D03'), false);
  assert.throws(() => performCase04Action(state, 'D03', { agentMode: 'sequential', operationId: 'bypass-preflight', stateVersion: state.stateVersion }), /尚未開啟/);
  assert.throws(() => performCase04Action(state, 'D04', { route: 'freeze', operationId: 'bypass-commitment', stateVersion: state.stateVersion }), /尚未開啟/);
  state = act(state, 'D10', { compatibility: 'isolate' });
  assert.equal(state.dataCompatibility, 'isolated');
  assert.equal(state.compatibilityDecision.revision, state.revision);
  assert.deepEqual(case04PublicView(state).availableActions.includes('D03'), true);
  state = act(state, 'D03', { agentMode: 'sequential' });
  assert.throws(() => performCase04Action(state, 'D09', { intent: 'limited', operationId: 'too-early-limited', stateVersion: state.stateVersion }), /後果|交接|證據|核准/);
  state = act(state, 'D04', { route: 'freeze' });
  state = act(state, 'D11', { proposal: 'limited' });
  assert.equal(state.approval.status, 'approved');
  state = act(state, 'D05', { cause: 'deploy' });
  state = act(state, 'D07', { scope: 'full' });
  assert.equal(state.dataCompatibility, 'unsafe', 'revealed schema drift invalidates the earlier isolation decision');
  assert.equal(state.approval.status, 'stale');
  state = act(state, 'D06', { response: 'contain' });
  state = act(state, 'D08', { depth: 'complete' });
  state = act(state, 'D11', { proposal: 'limited' });
  const ended = performCase04Action(state, 'D09', { intent: 'limited', operationId: 'safe-limited', stateVersion: state.stateVersion }).state;
  assert.equal(ended.ending.baseId, 'C04-LIMITED');
});

test('formal delivery requires responsible-person approval and revision changes invalidate it', () => {
  let state = reachCommitment('rollback', 'freeze');
  state = act(state, 'D11', { proposal: 'verified' });
  assert.equal(state.approval.status, 'changes-requested');
  assert.equal(state.approval.decision, 'rejected');
  assert.equal(state.approval.suggestedScope, 'limited');
  assert.ok(state.approval.reasons.length > 0);
  state = act(state, 'D11', { proposal: 'limited' });
  assert.equal(state.approval.owner, '客戶／產品負責人');
  assert.equal(state.approval.status, 'approved');
  state = act(state, 'D05', { cause: 'deploy' });
  state = act(state, 'D07', { scope: 'full' });
  assert.equal(state.approval.status, 'stale', 'schema drift invalidates approval even before a code revision changes');
  assert.throws(() => performCase04Action(state, 'D09', { intent: 'verified', operationId: 'too-early', stateVersion: state.stateVersion }), /相容|缺/);
  state = act(state, 'D06', { response: 'repair' });
  assert.equal(state.dataCompatibility, 'compatible');
  assert.notEqual(state.evidence.revision, state.revision, 'compatibility repair changes revision and invalidates old evidence');
  state = act(state, 'D07', { scope: 'full' });
  state = act(state, 'D08', { depth: 'complete' });
  assert.throws(() => performCase04Action(state, 'D09', { intent: 'verified', operationId: 'no-new-approval', stateVersion: state.stateVersion }), /負責人|核准/);
  state = act(state, 'D11', { proposal: 'verified' });
  const ended = performCase04Action(state, 'D09', { intent: 'verified', operationId: 'deliver', stateVersion: state.stateVersion }).state;
  assert.equal(ended.ending.baseId, 'C04-VERIFIED');
});

test('operation replay is idempotent and two rewards unlock at progress 2 and 4 only', () => {
  let state = createCase04Game({ templateId: 'balanced', seed: 8, eventRolls: Array(40).fill(1), progressionV2: true });
  const request = { method: 'logs', operationId: 'same-operation', stateVersion: state.stateVersion };
  const first = performCase04Action(state, 'D01', request);
  const replay = performCase04Action(first.state, 'D01', request);
  assert.equal(replay.cached, true);
  assert.equal(replay.state.token, first.state.token);
  state = first.state;
  state = act(state, 'D02', { strategy: 'investigate' });
  assert.equal(state.progression.rewardMilestones[0].status, 'claimed');
  state = act(state, 'D03', { agentMode: 'sequential' });
  state = act(state, 'D04', { route: 'freeze' });
  state = act(state, 'D05', { cause: 'requirement' });
  assert.equal(state.progression.rewardMilestones[1].status, 'claimed');
  assert.equal(state.progression.runExp, 4);
});

test('stopping before choosing a rescue strategy produces an honest ending instead of crashing', () => {
  const state = createCase04Game({
    templateId: 'balanced',
    seed: 408,
    eventRolls: Array(40).fill(1),
    progressionV2: true,
  });
  const ended = performCase04Action(state, 'D09', {
    intent: 'stop',
    operationId: 'stop-before-strategy',
    stateVersion: state.stateVersion,
  }).state;

  assert.equal(ended.ending.baseId, 'C04-STOP');
  assert.equal(ended.ending.playFacets[0].id, 'strategy-unselected');
  assert.equal(ended.ending.playFacets[0].title, '先保留現場，再決定怎麼救');
  assert.match(ended.ending.playFacets[0].text, /選定救火策略前先止損/);
});
