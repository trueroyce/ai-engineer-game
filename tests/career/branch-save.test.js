import test from 'node:test';
import assert from 'node:assert/strict';

import { createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { createCareer, loadCareer, reserveRun, saveActiveRun, saveCareer } from '../../src/career/state-v2.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.has(key) ? map.get(key) : null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test('active run persists route state, RNG position and operation cache across reload', () => {
  const storage = memoryStorage();
  let career = createCareer({ careerId: 'career-branch-save', templateId: 'beginner' });
  const initial = createCase02Game({ templateId: 'beginner', eventRolls: [100, 1], progressionV2: true });
  const reserved = reserveRun(career, { caseId: 'case-02', rulesVersion: initial.ruleVersion, initialState: initial });
  career = reserved.career;
  const runId = reserved.activeRun.runId;
  let state = performCase02Action(initial, 'B01', {
    idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export',
    operationId: 'persisted-operation', stateVersion: initial.stateVersion,
  }).state;
  assert.equal(state.story.openRecovery.sourceAction, 'B01');
  career = saveActiveRun(career, runId, state);
  saveCareer(career, storage);

  const loaded = loadCareer(storage).career.activeRun.state;
  assert.deepEqual(loaded.story, state.story);
  assert.deepEqual(loaded.rng, state.rng);
  assert.deepEqual(loaded.operationResults, state.operationResults);
  const repeated = performCase02Action(loaded, 'B01', {
    idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export',
    operationId: 'persisted-operation', stateVersion: initial.stateVersion,
  });
  assert.equal(repeated.cached, true);
  assert.deepEqual(repeated.state.rng, loaded.rng);
});
