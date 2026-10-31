import { LIMITS, TEMPLATES } from '../narrative/rules.js';
import { CASE02_LIMITS } from '../case-02/rules.js';
import { CASE03_LIMITS } from '../case-03/rules.js';
import { CASE04_LIMITS } from '../case-04/rules.js';
import { startingResourcesFor } from './resource-provenance.js';

export const RUN_SCHEMA_VERSION = 'ai-engineer-game.run.v1';
export const CANONICAL_RUN_ID_PATTERN_SOURCE = '^case0[1-4]-[a-f0-9]{16}$';
export const SAFE_RUN_ID_PATTERN_SOURCE = '^[a-z0-9][a-z0-9_-]{7,63}$';
const CANONICAL_RUN_ID = new RegExp(CANONICAL_RUN_ID_PATTERN_SOURCE);
const SAFE_RUN_ID = new RegExp(SAFE_RUN_ID_PATTERN_SOURCE);

export function isCanonicalRunId(value) {
  return typeof value === 'string' && CANONICAL_RUN_ID.test(value);
}

export function isSafeRunId(value) {
  return typeof value === 'string' && SAFE_RUN_ID.test(value);
}

export const SUPPORTED_GAME_RULE_VERSIONS = Object.freeze([
  'case-01-narrative@2',
  'case-01-narrative@3',
  'case-02-csv@2',
  'case-02-csv@3',
  'case-03-booking@1',
  'case-03-booking@2',
  'case-04-legacy@1',
]);

const RULE_CASE = Object.freeze({
  'case-01-narrative@2': 'case-01',
  'case-01-narrative@3': 'case-01',
  'case-02-csv@2': 'case-02',
  'case-02-csv@3': 'case-02',
  'case-03-booking@1': 'case-03',
  'case-03-booking@2': 'case-03',
  'case-04-legacy@1': 'case-04',
});

export const RUN_LIMITS = Object.freeze({
  maxFileBytes: 256 * 1024,
  maxToolTextBytes: 48 * 1024,
  maxTimeline: 32,
  maxCards: 6,
  maxKnownIssues: 24,
  maxChecks: 12,
  maxShortText: 240,
  maxLongText: 2_400,
});

const TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATES));
export const RUN_RESOURCE_BOUNDS = Object.freeze({
  maxToken: Math.max(LIMITS.tokenCap, CASE02_LIMITS.tokenCap, CASE03_LIMITS.tokenCap, CASE04_LIMITS.tokenCap),
  maxStress: Math.max(LIMITS.stressCap, CASE02_LIMITS.stressCap, CASE03_LIMITS.stressCap, CASE04_LIMITS.stressCap),
  maxTime: Math.max(...['case-01', 'case-02', 'case-03', 'case-04']
    .flatMap((caseId) => TEMPLATE_IDS.map((templateId) => startingResourcesFor(caseId, templateId).time))),
  maxOvertime: 2,
  maxWorkCount: LIMITS.hardWork,
  maxWorkTimeCost: 3,
});

export class RunValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RunValidationError';
    this.code = code;
  }
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

function fail(code, message) { throw new RunValidationError(code, message); }
function object(value, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_schema', `${at} 必須是 object`);
  return value;
}
function exactKeys(value, allowed, at) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail('invalid_schema', `${at}.${key} 不在 schema 內`);
}
function string(value, at, max = RUN_LIMITS.maxLongText) {
  if (typeof value !== 'string' || value.length > max) fail('invalid_schema', `${at} 必須是 ${max} 字元內的字串`);
  return value;
}
function id(value, at) {
  string(value, at, 64);
  if (!SAFE_ID.test(value)) fail('invalid_schema', `${at} 不是安全識別碼`);
  return value;
}
function integer(value, at, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail('invalid_schema', `${at} 必須是 ${min}–${max} 的整數`);
  return value;
}
function boolean(value, at) {
  if (typeof value !== 'boolean') fail('invalid_schema', `${at} 必須是 boolean`);
  return value;
}
function array(value, at, max) {
  if (!Array.isArray(value) || value.length > max) fail('invalid_schema', `${at} 必須是最多 ${max} 項的 array`);
  return value;
}

function validateResources(value, at) {
  object(value, at);
  exactKeys(value, ['token', 'stress', 'time', 'overtime', 'workCount'], at);
  integer(value.token, `${at}.token`, 0, RUN_RESOURCE_BOUNDS.maxToken);
  integer(value.stress, `${at}.stress`, 0, RUN_RESOURCE_BOUNDS.maxStress);
  integer(value.time, `${at}.time`, 0, RUN_RESOURCE_BOUNDS.maxTime);
  integer(value.overtime, `${at}.overtime`, 0, RUN_RESOURCE_BOUNDS.maxOvertime);
  integer(value.workCount, `${at}.workCount`, 0, RUN_RESOURCE_BOUNDS.maxWorkCount);
}

function validateProcess(value, at) {
  object(value, at);
  exactKeys(value, ['player', 'response', 'followUp', 'consequence'], at);
  for (const key of ['player', 'response', 'followUp', 'consequence']) string(value[key], `${at}.${key}`);
}

function validateTimelineItem(value, index) {
  const at = `timeline[${index}]`;
  object(value, at);
  exactKeys(value, ['sequence', 'kind', 'decision', 'resourceCost', 'observedOutcome', 'resourcesAfter'], at);
  integer(value.sequence, `${at}.sequence`, 1, RUN_LIMITS.maxTimeline);
  if (!['work', 'rest', 'upgrade', 'delivery'].includes(value.kind)) fail('invalid_schema', `${at}.kind 不支援`);
  object(value.decision, `${at}.decision`);
  exactKeys(value.decision, ['actionKey', 'label', 'choices'], `${at}.decision`);
  id(value.decision.actionKey, `${at}.decision.actionKey`);
  string(value.decision.label, `${at}.decision.label`, RUN_LIMITS.maxShortText);
  if (value.decision.choices !== undefined) {
    object(value.decision.choices, `${at}.decision.choices`);
    if (Object.keys(value.decision.choices).length > 8) fail('invalid_schema', `${at}.decision.choices 太多`);
    for (const [key, choice] of Object.entries(value.decision.choices)) {
      id(key, `${at}.decision.choices key`);
      if (!['string', 'boolean', 'number'].includes(typeof choice)) fail('invalid_schema', `${at}.decision.choices.${key} 型別不支援`);
      if (typeof choice === 'string') string(choice, `${at}.decision.choices.${key}`, RUN_LIMITS.maxShortText);
    }
  }
  object(value.resourceCost, `${at}.resourceCost`);
  exactKeys(value.resourceCost, ['token', 'workTime', 'overtimeUsed'], `${at}.resourceCost`);
  integer(value.resourceCost.token, `${at}.resourceCost.token`, 0, 30);
  integer(value.resourceCost.workTime, `${at}.resourceCost.workTime`, 0, RUN_RESOURCE_BOUNDS.maxWorkTimeCost);
  boolean(value.resourceCost.overtimeUsed, `${at}.resourceCost.overtimeUsed`);
  if (value.observedOutcome !== undefined) {
    object(value.observedOutcome, `${at}.observedOutcome`);
    exactKeys(value.observedOutcome, ['title', 'summary', 'process'], `${at}.observedOutcome`);
    string(value.observedOutcome.title, `${at}.observedOutcome.title`, RUN_LIMITS.maxShortText);
    string(value.observedOutcome.summary, `${at}.observedOutcome.summary`);
    if (value.observedOutcome.process !== undefined) validateProcess(value.observedOutcome.process, `${at}.observedOutcome.process`);
  }
  if (value.resourcesAfter !== undefined) validateResources(value.resourcesAfter, `${at}.resourcesAfter`);
}

export function validateRunRecord(record) {
  object(record, 'record');
  exactKeys(record, ['schemaVersion', 'runId', 'gameRuleVersion', 'caseId', 'knowledgeBoundary', 'character', 'cards', 'initialResources', 'finalResources', 'ending', 'publicProgress', 'timeline'], 'record');
  if (record.schemaVersion !== RUN_SCHEMA_VERSION) fail('unsupported_schema', '不支援的局紀錄版本');
  string(record.runId, 'runId', 64);
  if (!isSafeRunId(record.runId)) fail('invalid_schema', 'runId 格式不合法');
  if (!SUPPORTED_GAME_RULE_VERSIONS.includes(record.gameRuleVersion)) fail('unsupported_rule_version', '不支援的規則版本');
  id(record.caseId, 'caseId');
  if (RULE_CASE[record.gameRuleVersion] !== record.caseId) fail('invalid_schema', 'caseId and gameRuleVersion do not match');

  object(record.knowledgeBoundary, 'knowledgeBoundary');
  exactKeys(record.knowledgeBoundary, ['playerVisibleOnly', 'hiddenTerminalTruthIncluded', 'note'], 'knowledgeBoundary');
  if (record.knowledgeBoundary.playerVisibleOnly !== true || record.knowledgeBoundary.hiddenTerminalTruthIncluded !== false) fail('invalid_schema', 'knowledgeBoundary 必須維持公開資料邊界');
  string(record.knowledgeBoundary.note, 'knowledgeBoundary.note');

  object(record.character, 'character');
  exactKeys(record.character, ['templateId', 'name', 'difficulty'], 'character');
  id(record.character.templateId, 'character.templateId');
  string(record.character.name, 'character.name', RUN_LIMITS.maxShortText);
  string(record.character.difficulty, 'character.difficulty', RUN_LIMITS.maxShortText);

  array(record.cards, 'cards', RUN_LIMITS.maxCards).forEach((card, index) => {
    const at = `cards[${index}]`;
    object(card, at); exactKeys(card, ['id', 'name', 'level'], at);
    id(card.id, `${at}.id`); string(card.name, `${at}.name`, RUN_LIMITS.maxShortText); integer(card.level, `${at}.level`, 1, 2);
  });
  validateResources(record.initialResources, 'initialResources');
  validateResources(record.finalResources, 'finalResources');

  object(record.ending, 'ending');
  exactKeys(record.ending, ['baseId', 'tier', 'title', 'text', 'facets'], 'ending');
  id(record.ending.baseId, 'ending.baseId');
  string(record.ending.tier, 'ending.tier', RUN_LIMITS.maxShortText);
  string(record.ending.title, 'ending.title', RUN_LIMITS.maxShortText);
  string(record.ending.text, 'ending.text');
  array(record.ending.facets, 'ending.facets', 4).forEach((facet, index) => id(facet, `ending.facets[${index}]`));

  object(record.publicProgress, 'publicProgress');
  exactKeys(record.publicProgress, ['pendingQuestions', 'documentText', 'artifactText', 'checks', 'knownIssues', 'issueSummary'], 'publicProgress');
  array(record.publicProgress.pendingQuestions, 'publicProgress.pendingQuestions', 12).forEach((item, index) => string(item, `publicProgress.pendingQuestions[${index}]`, RUN_LIMITS.maxShortText));
  string(record.publicProgress.documentText, 'publicProgress.documentText');
  string(record.publicProgress.artifactText, 'publicProgress.artifactText');
  array(record.publicProgress.checks, 'publicProgress.checks', RUN_LIMITS.maxChecks).forEach((check, index) => {
    const at = `publicProgress.checks[${index}]`;
    object(check, at); exactKeys(check, ['label', 'status'], at);
    string(check.label, `${at}.label`, RUN_LIMITS.maxShortText); string(check.status, `${at}.status`, RUN_LIMITS.maxShortText);
  });
  array(record.publicProgress.knownIssues, 'publicProgress.knownIssues', RUN_LIMITS.maxKnownIssues).forEach((item, index) => string(item, `publicProgress.knownIssues[${index}]`));
  string(record.publicProgress.issueSummary, 'publicProgress.issueSummary');

  array(record.timeline, 'timeline', RUN_LIMITS.maxTimeline).forEach(validateTimelineItem);
  return record;
}
