import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createNarrativeGame,
  performAction,
  previewAction,
  readPreviousActionResult,
} from '../../src/narrative/engine.js';
import { projectNarrativeView } from '../../src/narrative/view.js';
import { renderPlay } from '../../src/narrative-ui/render.js';

let operation = 0;
function act(state, actionId, options = {}) {
  operation += 1;
  return performAction(state, actionId, {
    ...options,
    operationId: `round3-${operation}`,
    stateVersion: state.stateVersion,
  });
}

function resources(state) {
  return {
    token: state.token,
    stress: state.stress,
    timeLeft: state.timeLeft,
    overtimeUsed: state.overtimeUsed,
    workCount: state.workCount,
  };
}

test('viewing a paid revision is a pure read and the one-shot flag is not cache identity', () => {
  let state = createNarrativeGame({ seed: 'round3-a01-revision' });
  state = act(state, 'A01', { designate: 'A01-A' }).state;
  const paid = act(state, 'A01', { designate: 'A01-A', newRevision: true });
  state = paid.state;
  const before = structuredClone(state);

  const previous = readPreviousActionResult(state, 'A01');

  assert.equal(previous.recordId, paid.result.recordId);
  assert.equal(previous.event.id, paid.result.event.id);
  assert.deepEqual(previous.resourcesAfter, resources(state));
  assert.deepEqual(state, before, 'read must not mutate resources, state version, RNG decisions, or XP');
  assert.equal(previewAction(state, 'A01').cached, true, 'newRevision is a submission command, not persistent identity');
});

test('saved result retains the exact non-default target and card toggles', () => {
  let state = createNarrativeGame({ seed: 'round3-semantic-options' });
  state.cards = { C2: 1, C3: 1 };
  state.equipped = ['C2', 'C3'];
  state = act(state, 'A05', { designate: 'A05-A', useC2: true }).state;
  const worked = act(state, 'A07', {
    designate: 'A07-A',
    target: 'core',
    useC2: true,
    checkDelete: true,
  });
  state = worked.state;

  const previous = readPreviousActionResult(state, 'A07');
  assert.deepEqual(previous.semanticOptions, { target: 'core', useC2: true, checkDelete: true });
  assert.equal(previous.cost, worked.result.cost);
  assert.equal(previewAction(state, 'A07', previous.semanticOptions).cached, true);
});

test('repairDraft is one-shot and viewing its saved result does not create a third revision', () => {
  let state = createNarrativeGame({ seed: 'round3-repair-draft' });
  state = act(state, 'A01', { designate: 'A01-A' }).state;
  state.documents.wrongCompletionRule = true;
  state = act(state, 'A04', { designate: 'A04-A' }).state;
  state.documents.wrongCompletionRule = true;
  const repaired = act(state, 'A04', { designate: 'A04-A', repairDraft: true });
  state = repaired.state;
  const revision = state.revisions.A04;

  const previous = readPreviousActionResult(state, 'A04');

  assert.equal(previous.recordId, repaired.result.recordId);
  assert.equal(state.revisions.A04, revision);
  assert.equal(previewAction(state, 'A04').cached, true);
});

function organicReview(seed, selectedCards, useC3 = false) {
  let state = createNarrativeGame({ seed });
  if (selectedCards) {
    state.cards = Object.fromEntries(selectedCards.map((id) => [id, 1]));
    state.equipped = [...selectedCards];
  }
  state = act(state, 'A05').state;
  const implementation = act(state, 'A07', { target: 'persistence', checkDelete: false });
  assert.equal(implementation.result.event.id, 'A07-C', `${seed} must naturally reach the scoped A07-C variant`);
  state = implementation.state;
  assert.equal(state.functionState.R3, 'defective');
  assert.equal(state.knownIssues.some((issue) => issue.requirements.includes('R3') && issue.status !== 'fixed'), false);
  assert.match(implementation.result.event.story, /沒有真的跑|待驗/);
  return act(state, 'A09', { useC3 });
}

test('legal actions can organically discover or miss an undisclosed R3 defect', () => {
  const hit = organicReview('organic-3');
  const miss = organicReview('organic-5');

  assert.equal(hit.result.event.id, 'A09-A');
  assert.equal(hit.state.knownIssues.some((issue) => issue.requirements.includes('R3')), true);
  assert.equal(miss.result.event.id, 'A09-C');
  assert.equal(miss.state.knownIssues.some((issue) => issue.requirements.includes('R3')), false);
});

test('C3 improves an otherwise missed organic hidden-defect review on the same seed', () => {
  const selectedCards = ['C3', 'C6'];
  const withoutC3 = organicReview('deep-organic-15', selectedCards, false);
  const withC3 = organicReview('deep-organic-15', selectedCards, true);

  assert.equal(withoutC3.result.event.id, 'A09-C');
  assert.equal(withC3.result.event.id, 'A09-A');
});

test('performing the duplicate-delete check keeps the canonical observed text and known issue', () => {
  let state = createNarrativeGame({ seed: 'deep-observed-0' });
  state = act(state, 'A05').state;
  const observed = act(state, 'A07', { target: 'persistence', checkDelete: true });

  assert.equal(observed.result.event.id, 'A07-C');
  assert.match(observed.result.event.story, /第二條「買牛奶」被刪掉時/);
  assert.equal(observed.state.knownIssues.some((issue) => issue.code === 'duplicate-delete'), true);
});

test('a completed action remains viewable when it has no legal new-work follow-up', () => {
  let state = createNarrativeGame({ seed: 'round3-history-only' });
  state.requirement.scope = 'pending_change';
  state = act(state, 'A03', { designate: 'A03-A' }).state;

  const view = projectNarrativeView(state);
  const action = view.actions.find((item) => item.id === 'A03');
  const html = renderPlay(view, true);

  assert.equal(action.hasPrevious, true);
  assert.equal(action.canStart, false);
  assert.match(html, /data-view-result="A03"/);
  assert.doesNotMatch(html, /data-action="A03"/);
  assert.match(html, /過去工作（唯讀）/);
});
