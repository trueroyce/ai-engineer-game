import test from 'node:test';
import assert from 'node:assert/strict';

import { createNarrativeGame, performAction } from '../../src/narrative/engine.js';
import { createCase02Game, performCase02Action } from '../../src/case-02/engine-v2.js';
import { createCase03Game, performCase03Action } from '../../src/case-03/engine.js';
import { chooseCase04Reward, createCase04Game, performCase04Action } from '../../src/case-04/engine.js';
import { createToolService } from '../../src/mcp/tools.js';
import { buildCareerCaseRunRecord } from '../../src/postgame/career-run-export.js';
import { buildRunRecord } from '../../src/postgame/run-export.js';
import { RUN_RESOURCE_BOUNDS, validateRunRecord } from '../../src/postgame/run-schema.js';
import { historicStartingResourcesFor, startingResourcesFor } from '../../src/postgame/resource-provenance.js';

function act01(state, actionId, options = {}) {
  return performAction(state, actionId, {
    ...options,
    operationId: `provenance-${actionId}-${state.stateVersion}`,
    stateVersion: state.stateVersion,
  }).state;
}

function actCareer(perform, state, actionId, options = {}) {
  return perform(state, actionId, {
    ...options,
    operationId: `provenance-${state.caseId}-${actionId}-${state.stateVersion}`,
    stateVersion: state.stateVersion,
  }).state;
}

const CAREER_CASES = Object.freeze([
  {
    caseId: 'case-02',
    create: (templateId) => createCase02Game({ templateId, seed: 202, progressionV2: true }),
    first: (state) => actCareer(performCase02Action, state, 'B01', {
      idPolicy: 'canonical-map', datePolicy: 'normalize-iso', duplicatePolicy: 'latest-export',
    }),
    stop: (state) => actCareer(performCase02Action, state, 'B09', { intent: 'stop' }),
    oldRule: 'case-02-csv@2',
  },
  {
    caseId: 'case-03',
    create: (templateId) => createCase03Game({ templateId, seed: 303, progressionV2: true }),
    first: (state) => actCareer(performCase03Action, state, 'C01', { scope: 'core' }),
    stop: (state) => actCareer(performCase03Action, state, 'C07', { intent: 'stop' }),
    oldRule: 'case-03-booking@1',
  },
  {
    caseId: 'case-04',
    create: (templateId) => createCase04Game({ templateId, seed: 404, progressionV2: true }),
    first: (state) => actCareer(performCase04Action, state, 'D01', { method: 'reproduce' }),
    stop: (state) => {
      let planned = actCareer(performCase04Action, state, 'D02', { strategy: 'patch' });
      if (planned.pendingReward) planned = chooseCase04Reward(planned, planned.pendingReward.choices[0]).state;
      return actCareer(performCase04Action, planned, 'D09', { intent: 'stop' });
    },
    oldRule: null,
  },
]);

for (const templateId of ['ultimate', 'beginner']) {
  test(`case-01 ${templateId} exports the exact fresh-start resources and gross first cost`, () => {
    let state = createNarrativeGame({ templateId, seed: `resource-case01-${templateId}` });
    const expected = startingResourcesFor('case-01', templateId);
    assert.deepEqual(state.initialResources, expected);
    state = act01(state, 'A01', { designate: 'A01-A' });
    state = act01(state, 'A12', { intent: 'stop' });
    const record = buildRunRecord(state);
    assert.deepEqual(record.initialResources, expected);
    assert.ok(record.timeline[0].resourceCost.token > 0);
    assert.ok(record.timeline[0].resourceCost.workTime > 0);
    assert.equal(validateRunRecord(record), record);
  });

  for (const item of CAREER_CASES) {
    test(`${item.caseId} ${templateId} exports exact initial resources and a non-free first action`, () => {
      let state = item.create(templateId);
      const expected = startingResourcesFor(item.caseId, templateId);
      assert.deepEqual(state.initialResources, expected);
      state = item.first(state);
      state = item.stop(state);
      const record = buildCareerCaseRunRecord(state);
      assert.deepEqual(record.initialResources, expected);
      assert.ok(record.timeline[0].resourceCost.token > 0);
      assert.ok(record.timeline[0].resourceCost.workTime > 0);
      assert.ok(record.timeline[0].resourcesAfter.token <= expected.token);
      assert.ok(record.timeline[0].resourcesAfter.time < expected.time);
      assert.equal(validateRunRecord(record), record);
    });
  }
}

test('legacy records without a snapshot retain their historic resource profile', () => {
  for (const item of CAREER_CASES) {
    let state = item.create('beginner');
    const historic = historicStartingResourcesFor(item.caseId);
    delete state.initialResources;
    state.token = historic.token;
    state.stress = historic.stress;
    state.timeLeft = historic.time;
    if (item.oldRule) state.ruleVersion = item.oldRule;
    state = item.first(state);
    state = item.stop(state);
    const record = buildCareerCaseRunRecord(state);
    assert.deepEqual(record.initialResources, historic);
    assert.equal(validateRunRecord(record), record);
  }
});

test('schema resource bounds are derived from the accepted profiles without becoming unbounded', () => {
  assert.equal(RUN_RESOURCE_BOUNDS.maxTime, 15);
  assert.equal(RUN_RESOURCE_BOUNDS.maxToken, 30);
  assert.equal(RUN_RESOURCE_BOUNDS.maxWorkTimeCost, 3);

  let state = createNarrativeGame({ templateId: 'beginner', seed: 'resource-boundary' });
  state = act01(state, 'A01', { designate: 'A01-A' });
  state = act01(state, 'A12', { intent: 'stop' });
  const record = buildRunRecord(state);
  record.initialResources.time = 16;
  assert.throws(() => validateRunRecord(record), /initialResources\.time/);
});

test('get_rules publishes both target templates and the bounded career attempt modifiers for all cases', async () => {
  const service = createToolService({ list: async () => [], get: async () => { throw new Error('unused'); } });
  const response = await service.call('get_rules', {});
  const payload = JSON.parse(response.content[0].text);
  for (const caseId of ['case-01', 'case-02', 'case-03', 'case-04']) {
    const resources = caseId === 'case-01'
      ? payload.publicRulesByCase[caseId].resources
      : payload.publicRulesByCase[caseId].resources;
    assert.deepEqual(resources.startingByTemplate.ultimate, startingResourcesFor(caseId, 'ultimate'));
    assert.deepEqual(resources.startingByTemplate.beginner, startingResourcesFor(caseId, 'beginner'));
  }
  assert.equal(payload.publicRules.careerAttemptModifiers.byTemplate.ultimate.value, 5);
  assert.equal(payload.publicRules.careerAttemptModifiers.byTemplate.beginner.value, 30);
});
