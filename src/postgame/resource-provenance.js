import { LIMITS, case01StartingResources } from '../narrative/rules.js';
import { CASE02_LIMITS, case02StartingResources } from '../case-02/rules.js';
import { CASE03_LIMITS, case03StartingResources } from '../case-03/rules.js';
import { CASE04_LIMITS, case04StartingResources } from '../case-04/rules.js';

const STARTERS = Object.freeze({
  'case-01': case01StartingResources,
  'case-02': case02StartingResources,
  'case-03': case03StartingResources,
  'case-04': case04StartingResources,
});

const HISTORIC = Object.freeze({
  'case-01': Object.freeze({ token: LIMITS.token, stress: 0, time: LIMITS.deadline, overtime: 0, workCount: 0 }),
  'case-02': Object.freeze({ token: CASE02_LIMITS.token, stress: 0, time: CASE02_LIMITS.deadline, overtime: 0, workCount: 0 }),
  'case-03': Object.freeze({ token: CASE03_LIMITS.token, stress: 0, time: CASE03_LIMITS.deadline, overtime: 0, workCount: 0 }),
  'case-04': Object.freeze({ token: CASE04_LIMITS.token, stress: 0, time: CASE04_LIMITS.deadline, overtime: 0, workCount: 0 }),
});

const LEGACY_RULES = new Set(['case-01-narrative@2', 'case-02-csv@2', 'case-03-booking@1']);

function validSnapshot(value) {
  return value && ['token', 'stress', 'time', 'overtime', 'workCount']
    .every((key) => Number.isInteger(value[key]) && value[key] >= 0);
}

function copy(value) {
  return { token: value.token, stress: value.stress, time: value.time, overtime: value.overtime, workCount: value.workCount };
}

export function startingResourcesFor(caseId, templateId) {
  const factory = STARTERS[caseId];
  if (!factory) throw new Error(`Unsupported case resource profile: ${caseId}`);
  return copy(factory(templateId));
}

export function historicStartingResourcesFor(caseId) {
  const resources = HISTORIC[caseId];
  if (!resources) throw new Error(`Unsupported historic resource profile: ${caseId}`);
  return copy(resources);
}

export function resolveInitialResourceProvenance(state) {
  if (validSnapshot(state?.initialResources)) return { resources: copy(state.initialResources), source: 'state-snapshot' };

  const historic = historicStartingResourcesFor(state.caseId);
  if (LEGACY_RULES.has(state.ruleVersion)) return { resources: historic, source: 'legacy-rule-profile' };

  const current = startingResourcesFor(state.caseId, state.templateId);
  if (current.token === historic.token && current.time === historic.time) return { resources: current, source: 'current-rule-profile' };

  const first = state.log?.find((item) => item?.resources)?.resources;
  if (first && (first.token > historic.token || first.time > historic.time)) {
    return { resources: current, source: 'balanced-log-inference' };
  }
  return { resources: historic, source: 'historic-log-inference' };
}

export function startingResourcesByTemplate(caseId, templateIds) {
  return Object.fromEntries(templateIds.map((templateId) => [templateId, startingResourcesFor(caseId, templateId)]));
}
