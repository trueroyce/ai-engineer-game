import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../../src/career/cards.js';
import {
  CAREER_RESET_MARKER_KEY, CAREER_STORAGE_KEY, LEGACY_CAREER_STORAGE_KEY, completeStarterSelection, createCareer,
  decodeCareer, getLoadout, loadCareer, mergeCardReward, migrateCareerV1, reserveRun,
  resetCareer, saveActiveRun, saveCareer, settleCase, toggleEquipped, validateCareer,
} from '../../src/career/state-v2.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}

function legacy(overrides = {}) {
  return {
    schemaVersion: LEGACY_CAREER_STORAGE_KEY, careerId: 'career-v2-test', templateId: 'balanced',
    exp: 9, level: 3, cards: { C1: 2, C7: 1 }, equipped: ['C1', 'C7'],
    rewardLedger: ['case-01:final_delivery'], completedCases: {},
    createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T01:00:00.000Z', ...overrides,
  };
}

test('v1 migration preserves cards, ledger and creates per-case applicable loadouts', () => {
  const migrated = migrateCareerV1(legacy());
  assert.equal(migrated.schemaVersion, CAREER_STORAGE_KEY);
  assert.deepEqual(migrated.cards, { C1: 2, C7: 1 });
  assert.deepEqual(migrated.loadoutsByCase['case-01'], ['C1']);
  assert.deepEqual(migrated.loadoutsByCase['case-02'], ['C1', 'C7']);
  assert.deepEqual(migrated.loadoutsByCase['case-03'], ['C1', 'C7']);
  assert.deepEqual(migrated.rewardLedger, ['case-01:final_delivery']);
  assert.equal(migrated.starterSelection.status, 'completed');
});

test('empty legacy career gets exactly one starter selection while repeated selection is idempotent', () => {
  const migrated = migrateCareerV1(legacy({ exp: 0, level: 1, cards: {}, equipped: [] }));
  assert.equal(migrated.starterSelection.status, 'pending');
  const first = completeStarterSelection(migrated, 'C2');
  assert.equal(first.career.cards.C2, 1);
  assert.deepEqual(first.career.loadoutsByCase['case-01'], ['C2']);
  assert.deepEqual(first.career.loadoutsByCase['case-02'], ['C2']);
  const repeated = completeStarterSelection(first.career, 'C3');
  assert.equal(repeated.repeated, true);
  assert.deepEqual(repeated.career.cards, { C2: 1 });
});

test('load migrates v1 once, keeps original bytes, then prefers v2', () => {
  const storage = memoryStorage();
  const legacyRaw = JSON.stringify({ schemaVersion: LEGACY_CAREER_STORAGE_KEY, career: legacy() });
  storage.setItem(LEGACY_CAREER_STORAGE_KEY, legacyRaw);
  const first = loadCareer(storage);
  assert.equal(first.status, 'ready'); assert.equal(first.migrated, true);
  assert.equal(storage.getItem(LEGACY_CAREER_STORAGE_KEY), legacyRaw);
  const v2Raw = storage.getItem(CAREER_STORAGE_KEY);
  const second = loadCareer(storage);
  assert.equal(second.migrated, false); assert.equal(storage.getItem(CAREER_STORAGE_KEY), v2Raw);
});

test('invalid v2 is reported and never overwritten or silently replaced by valid v1', () => {
  const storage = memoryStorage();
  const broken = '{"schemaVersion":"ai-engineer-game.career.v2","career":{"oops":1}}';
  storage.setItem(CAREER_STORAGE_KEY, broken);
  storage.setItem(LEGACY_CAREER_STORAGE_KEY, JSON.stringify({ schemaVersion: LEGACY_CAREER_STORAGE_KEY, career: legacy() }));
  assert.equal(loadCareer(storage).status, 'invalid');
  assert.equal(storage.getItem(CAREER_STORAGE_KEY), broken);
  assert.equal(decodeCareer('{bad').status, 'invalid');
});

test('explicit reset keeps v1 recovery bytes but a reset marker prevents legacy career resurrection', () => {
  const storage = memoryStorage();
  const legacyRaw = JSON.stringify({ schemaVersion: LEGACY_CAREER_STORAGE_KEY, career: legacy() });
  storage.setItem(LEGACY_CAREER_STORAGE_KEY, legacyRaw);
  assert.equal(loadCareer(storage).status, 'ready');
  resetCareer(storage, '2026-10-28T12:00:00.000Z');
  assert.equal(storage.getItem(CAREER_STORAGE_KEY), null);
  assert.equal(storage.getItem(LEGACY_CAREER_STORAGE_KEY), legacyRaw);
  assert.ok(storage.getItem(CAREER_RESET_MARKER_KEY));
  assert.deepEqual(loadCareer(storage), { status: 'empty', reset: true });
  const fresh = createCareer({ careerId: 'career-after-reset', templateId: 'balanced' });
  saveCareer(fresh, storage, '2026-10-28T12:01:00.000Z');
  assert.equal(storage.getItem(CAREER_RESET_MARKER_KEY), null);
  assert.equal(loadCareer(storage).career.careerId, 'career-after-reset');
});

test('case-specific loadouts retain collection and never overwrite another case', () => {
  let career = createCareer({ careerId: 'career-loadouts', templateId: 'balanced' });
  career = completeStarterSelection(career, 'C1').career;
  career = mergeCardReward(career, 'C7').career;
  career = toggleEquipped(career, 'C7', 'case-02');
  assert.deepEqual(getLoadout(career, 'case-01'), ['C1']);
  assert.deepEqual(getLoadout(career, 'case-02'), ['C1']);
  assert.equal(career.cards.C7, 1);
  career = toggleEquipped(career, 'C7', 'case-03');
  assert.deepEqual(getLoadout(career, 'case-02'), ['C1']);
  assert.deepEqual(getLoadout(career, 'case-03'), ['C1']);
});

test('each case enforces three applicable slots while collection remains unbounded', () => {
  let career = createCareer({ careerId: 'career-card-cap', templateId: 'balanced' });
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C7', 'C13', 'C18']) career = mergeCardReward(career, id).career;
  assert.equal(Object.keys(career.cards).length, 7);
  assert.equal(career.loadoutsByCase['case-01'].length, 3);
  assert.throws(() => toggleEquipped(career, 'C4', 'case-01'), /最多裝備 3 張/);
  assert.throws(() => toggleEquipped(career, 'C7', 'case-01'), /不適用/);
});

test('active run persists full state and settlement is idempotent while a legal replay gets a new id', () => {
  let career = completeStarterSelection(createCareer({ careerId: 'career-runs-test', templateId: 'balanced' }), 'C1').career;
  let start = reserveRun(career, { caseId: 'case-02', rulesVersion: 'case-02-csv@3', initialState: { phase: 'active', token: 9, rngIndex: 4, operationCache: { op1: { success: false } }, rewardPicks: ['C13'] } });
  career = start.career;
  const runId = start.activeRun.runId;
  career = saveActiveRun(career, runId, { ...start.activeRun.state, token: 7, eventCounts: { contract: { drift: 1 } } });
  const persisted = saveCareer(career, memoryStorage());
  assert.equal(persisted.activeRun.runId, runId); assert.equal(persisted.activeRun.state.token, 7);
  const ended = { ...persisted.activeRun.state, runId, phase: 'ended', caseId: 'case-02', ledger: ['contract_aligned'], cards: { C1: 1, C13: 1 }, equipped: ['C1', 'C13'], careerRewards: [{ kind: 'shard', amount: 2, claimId: 'reward:first-third' }], rewardClaims: ['reward:first-third'], ending: { baseId: 'verified' } };
  const first = settleCase(persisted, ended);
  assert.equal(first.career.activeRun, null); assert.equal(first.career.completedCases['case-02'].plays, 1); assert.equal(first.career.cardShards, 2);
  const repeated = settleCase(first.career, ended);
  assert.equal(repeated.repeated, true); assert.equal(repeated.career.completedCases['case-02'].plays, 1); assert.equal(repeated.career.cardShards, 2);
  const replay = reserveRun(first.career, { caseId: 'case-02', rulesVersion: 'case-02-csv@3', initialState: { phase: 'active' } });
  assert.notEqual(replay.activeRun.runId, runId);
});

test('all new cards expose bounded two-level effects and explicit case applicability', () => {
  for (const id of ['C13', 'C14', 'C15', 'C16', 'C17', 'C18']) {
    assert.equal(CARDS[id].maxLevel, 2); assert.ok(CARDS[id].effects.length); assert.ok(CARDS[id].cases.length);
    assert.match(CARDS[id].description, /Lv\.1/); assert.match(CARDS[id].upgradeDescription, /Lv\.2/);
  }
  assert.doesNotThrow(() => validateCareer(createCareer({ careerId: 'career-valid-v2', templateId: 'beginner' })));
});
