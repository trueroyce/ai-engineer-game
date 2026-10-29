import { TEMPLATES } from '../narrative/rules.js';
import { CARDS, CASE_IDS, MAX_CASE_LOADOUT, cardApplies } from './cards.js';

export const CAREER_SCHEMA_VERSION = 'ai-engineer-game.career.v2';
export const CAREER_STORAGE_KEY = 'ai-engineer-game.career.v2';
export const LEGACY_CAREER_STORAGE_KEY = 'ai-engineer-game.career.v1';
export const CAREER_RESET_MARKER_KEY = 'ai-engineer-game.career.v2.reset';
export const MAX_EQUIPPED_CARDS = MAX_CASE_LOADOUT;
export const CAREER_LEVELS = Object.freeze([
  { level: 1, minExp: 0, title: '剛打開終端機' }, { level: 2, minExp: 4, title: '開始會留證據' },
  { level: 3, minExp: 9, title: '把案子帶回家' }, { level: 4, minExp: 15, title: '需求變更倖存者' },
]);
const CASE_REWARDS = Object.freeze({
  'case-01': Object.freeze({ requirements_clear: 1, confirmed_spec: 1, working_core: 1, persistence_correct: 1, full_verification: 1, limited_trial: 1, final_delivery: 2 }),
  'case-02': Object.freeze({ contract_aligned: 1, sources_normalized: 1, truth_reconciled: 1, change_contracted: 1, cross_source_tests: 1, audit_trace: 1, verified_delivery: 2 }),
  'case-03': Object.freeze({ requirements_decided: 1, interface_approved: 1, implementation_complete: 1, merge_reviewed: 1, change_contracted: 1, current_evidence: 1, verified_delivery: 2 }),
  'case-04': Object.freeze({ incident_scoped: 1, strategy_committed: 1, service_stabilized: 1, root_cause_decided: 1, current_evidence: 1, handoff_ready: 1, verified_delivery: 2 }),
});
const clone = (value) => structuredClone(value);
const emptyLoadouts = () => ({ 'case-01': [], 'case-02': [], 'case-03': [], 'case-04': [] });
const plain = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const validCareerId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{7,63}$/.test(value);
function assertPlain(value, label) { if (!plain(value)) throw new Error(`${label} 必須是 object`); }

export function careerLevelForExp(exp) { return [...CAREER_LEVELS].reverse().find((entry) => exp >= entry.minExp) ?? CAREER_LEVELS[0]; }

export function createCareer({ careerId, templateId, now = new Date().toISOString() }) {
  if (!validCareerId(careerId)) throw new Error('careerId 格式不合法');
  if (!TEMPLATES[templateId]) throw new Error('未知角色模板');
  return { schemaVersion: CAREER_SCHEMA_VERSION, careerId, templateId, exp: 0, level: 1, cards: {}, loadoutsByCase: emptyLoadouts(), starterSelection: { status: 'pending' }, cardShards: 0, nextRunNumber: 1, activeRun: null, settledRuns: {}, rewardLedger: [], completedCases: {}, createdAt: now, updatedAt: now };
}

export function validateCareer(input) {
  assertPlain(input, 'career'); const career = clone(input);
  const exact = ['schemaVersion', 'careerId', 'templateId', 'exp', 'level', 'cards', 'loadoutsByCase', 'starterSelection', 'cardShards', 'nextRunNumber', 'activeRun', 'settledRuns', 'rewardLedger', 'completedCases', 'createdAt', 'updatedAt'];
  if (Object.keys(career).some((key) => !exact.includes(key))) throw new Error('career 含未知欄位');
  if (career.schemaVersion !== CAREER_SCHEMA_VERSION || !validCareerId(career.careerId) || !TEMPLATES[career.templateId]) throw new Error('職涯版本、識別或模板不合法');
  if (!Number.isInteger(career.exp) || career.exp < 0 || career.exp > 99999 || career.level !== careerLevelForExp(career.exp).level) throw new Error('EXP 或等級不合法');
  assertPlain(career.cards, 'cards');
  for (const [id, level] of Object.entries(career.cards)) if (!CARDS[id] || !Number.isInteger(level) || level < 1 || level > CARDS[id].maxLevel) throw new Error('卡片不合法');
  assertPlain(career.loadoutsByCase, 'loadoutsByCase');
  if (Object.keys(career.loadoutsByCase).sort().join('|') !== [...CASE_IDS].sort().join('|')) throw new Error('案件裝備欄位不完整');
  for (const caseId of CASE_IDS) {
    const loadout = career.loadoutsByCase[caseId];
    if (!Array.isArray(loadout) || loadout.length > MAX_CASE_LOADOUT || new Set(loadout).size !== loadout.length || loadout.some((id) => !career.cards[id] || !cardApplies(id, caseId))) throw new Error('案件裝備不合法');
  }
  assertPlain(career.starterSelection, 'starterSelection');
  if (!['pending', 'completed'].includes(career.starterSelection.status) || (career.starterSelection.cardId && !career.cards[career.starterSelection.cardId])) throw new Error('起手選擇不合法');
  if (!Number.isInteger(career.cardShards) || career.cardShards < 0 || !Number.isInteger(career.nextRunNumber) || career.nextRunNumber < 1) throw new Error('職涯計數不合法');
  if (career.activeRun !== null) {
    assertPlain(career.activeRun, 'activeRun');
    if (!/^run-[a-z0-9-]{8,96}$/.test(career.activeRun.runId ?? '') || !CASE_IDS.includes(career.activeRun.caseId) || typeof career.activeRun.rulesVersion !== 'string') throw new Error('activeRun 識別不合法');
    assertPlain(career.activeRun.state, 'activeRun.state');
  }
  assertPlain(career.settledRuns, 'settledRuns');
  for (const [id, summary] of Object.entries(career.settledRuns)) { if (!/^run-[a-z0-9-]{8,96}$/.test(id)) throw new Error('settled run id 不合法'); assertPlain(summary, 'settled run'); }
  if (!Array.isArray(career.rewardLedger) || new Set(career.rewardLedger).size !== career.rewardLedger.length || career.rewardLedger.some((id) => typeof id !== 'string' || id.length > 160)) throw new Error('獎勵帳本不合法');
  assertPlain(career.completedCases, 'completedCases');
  for (const summary of Object.values(career.completedCases)) { assertPlain(summary, 'completed case'); if (!Number.isInteger(summary.plays) || summary.plays < 1 || typeof summary.lastEnding !== 'string' || typeof summary.lastPlayedAt !== 'string') throw new Error('案件摘要不合法'); }
  if (typeof career.createdAt !== 'string' || typeof career.updatedAt !== 'string') throw new Error('時間欄位不合法');
  Object.defineProperty(career, 'equipped', { enumerable: false, configurable: true, get() { return this.loadoutsByCase['case-01']; } });
  return career;
}

function validateLegacy(career) {
  assertPlain(career, 'legacy career');
  if (career.schemaVersion !== LEGACY_CAREER_STORAGE_KEY || !validCareerId(career.careerId) || !TEMPLATES[career.templateId] || !plain(career.cards) || !Array.isArray(career.equipped) || !Array.isArray(career.rewardLedger)) throw new Error('舊職涯格式不合法');
  return clone(career);
}

export function migrateCareerV1(input) {
  const old = validateLegacy(input);
  const cards = Object.fromEntries(Object.entries(old.cards).filter(([id, level]) => CARDS[id] && Number.isInteger(level) && level >= 1).map(([id, level]) => [id, Math.min(CARDS[id].maxLevel, level)]));
  const loadoutsByCase = emptyLoadouts();
  for (const caseId of CASE_IDS) loadoutsByCase[caseId] = old.equipped.filter((id) => cards[id] && cardApplies(id, caseId)).slice(0, MAX_CASE_LOADOUT);
  return validateCareer({ schemaVersion: CAREER_SCHEMA_VERSION, careerId: old.careerId, templateId: old.templateId, exp: old.exp, level: careerLevelForExp(old.exp).level, cards, loadoutsByCase, starterSelection: Object.keys(cards).length ? { status: 'completed' } : { status: 'pending' }, cardShards: 0, nextRunNumber: 1, activeRun: null, settledRuns: {}, rewardLedger: [...new Set(old.rewardLedger)], completedCases: clone(old.completedCases ?? {}), createdAt: old.createdAt, updatedAt: old.updatedAt });
}

export function encodeCareer(career, now = new Date().toISOString()) { const next = validateCareer({ ...clone(career), updatedAt: now }); return JSON.stringify({ schemaVersion: CAREER_SCHEMA_VERSION, savedAt: now, career: next }); }
export function decodeCareer(text) {
  let envelope; try { envelope = JSON.parse(text); } catch { return { status: 'invalid', reason: '存檔不是合法 JSON' }; }
  if (!plain(envelope)) return { status: 'invalid', reason: '存檔外層格式錯誤' };
  if (envelope.schemaVersion !== CAREER_SCHEMA_VERSION) return { status: 'unsupported', reason: `不支援的存檔版本：${String(envelope.schemaVersion)}` };
  try {
    const candidate = clone(envelope.career);
    const legacyCaseIds = ['case-01', 'case-02', 'case-03'];
    const loadoutIds = plain(candidate?.loadoutsByCase) ? Object.keys(candidate.loadoutsByCase).sort() : [];
    const upgraded = loadoutIds.join('|') === legacyCaseIds.join('|');
    if (upgraded) candidate.loadoutsByCase['case-04'] = [];
    return { status: 'ready', career: validateCareer(candidate), upgraded };
  } catch (error) { return { status: 'invalid', reason: error.message }; }
}
export function decodeLegacyCareer(text) {
  let envelope; try { envelope = JSON.parse(text); } catch { return { status: 'invalid', reason: '舊存檔不是合法 JSON' }; }
  if (!plain(envelope) || envelope.schemaVersion !== LEGACY_CAREER_STORAGE_KEY) return { status: 'unsupported', reason: '不是可遷移的 v1 職涯' };
  try { return { status: 'ready', career: migrateCareerV1(envelope.career) }; } catch (error) { return { status: 'invalid', reason: error.message }; }
}

export function loadCareer(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(CAREER_STORAGE_KEY);
    if (raw !== null) return { ...decodeCareer(raw), raw, migrated: false };
    // Preserve v1 as a recovery backup without resurrecting it after an
    // explicit player reset of the migrated career.
    if (storage.getItem(CAREER_RESET_MARKER_KEY) !== null) return { status: 'empty', reset: true };
    const legacyRaw = storage.getItem(LEGACY_CAREER_STORAGE_KEY);
    if (legacyRaw === null) return { status: 'empty' };
    const migrated = decodeLegacyCareer(legacyRaw);
    if (migrated.status !== 'ready') return { ...migrated, raw: legacyRaw, migrated: false };
    const career = saveCareer(migrated.career, storage);
    return { status: 'ready', career, raw: storage.getItem(CAREER_STORAGE_KEY), migrated: true };
  } catch (error) { return { status: 'unavailable', reason: `瀏覽器儲存不可用：${error.message}` }; }
}
export function saveCareer(career, storage = globalThis.localStorage, now = new Date().toISOString()) { const text = encodeCareer(career, now); storage.setItem(CAREER_STORAGE_KEY, text); storage.removeItem(CAREER_RESET_MARKER_KEY); return decodeCareer(text).career; }
export function resetCareer(storage = globalThis.localStorage, now = new Date().toISOString()) { storage.removeItem(CAREER_STORAGE_KEY); storage.setItem(CAREER_RESET_MARKER_KEY, JSON.stringify({ resetAt: now, preservedLegacyKey: LEGACY_CAREER_STORAGE_KEY })); }
export function getLoadout(career, caseId) { return validateCareer(career).loadoutsByCase[caseId].slice(); }

export function toggleEquipped(original, cardId, caseId = 'case-01') {
  const career = validateCareer(original); if (!CASE_IDS.includes(caseId)) throw new Error('未知案件');
  if (!career.cards[cardId]) throw new Error('尚未持有這張卡'); if (!cardApplies(cardId, caseId)) throw new Error('卡片不適用此案件');
  const loadout = career.loadoutsByCase[caseId];
  if (loadout.includes(cardId)) career.loadoutsByCase[caseId] = loadout.filter((id) => id !== cardId);
  else { if (loadout.length >= MAX_CASE_LOADOUT) throw new Error('每案最多裝備 3 張；請先停用一張'); loadout.push(cardId); }
  return career;
}

export function mergeCardReward(original, cardId) {
  const career = validateCareer(original); const card = CARDS[cardId]; if (!card) throw new Error('未知卡片');
  const previousLevel = career.cards[cardId] ?? 0; career.cards[cardId] = Math.min(card.maxLevel, previousLevel + 1);
  for (const caseId of card.cases) { const loadout = career.loadoutsByCase[caseId]; if (!previousLevel && loadout.length < MAX_CASE_LOADOUT && !loadout.includes(cardId)) loadout.push(cardId); }
  return { career, disposition: previousLevel ? 'fused' : 'collected', previousLevel, level: career.cards[cardId] };
}

export function completeStarterSelection(original, cardId) {
  const career = validateCareer(original); if (career.starterSelection.status === 'completed') return { career, repeated: true };
  const merged = mergeCardReward(career, cardId); merged.career.starterSelection = { status: 'completed', cardId }; return { ...merged, repeated: false };
}

export function reserveRun(original, { caseId, rulesVersion, initialState, now = new Date().toISOString() }) {
  const career = validateCareer(original); if (career.activeRun) return { career, activeRun: clone(career.activeRun), resumed: true };
  if (!CASE_IDS.includes(caseId) || typeof rulesVersion !== 'string' || !plain(initialState)) throw new Error('起局資料不合法');
  const runId = `run-${career.careerId}-${career.nextRunNumber}`; career.nextRunNumber += 1;
  career.activeRun = { runId, caseId, rulesVersion, state: clone(initialState), startedAt: now, updatedAt: now };
  return { career, activeRun: clone(career.activeRun), resumed: false };
}
export function saveActiveRun(original, runId, state, now = new Date().toISOString()) {
  const career = validateCareer(original); if (!career.activeRun || career.activeRun.runId !== runId) throw new Error('active run 不一致'); assertPlain(state, 'active run state');
  career.activeRun.state = clone(state); career.activeRun.updatedAt = now; return career;
}

export function settleCase(original, caseState, now = new Date().toISOString()) {
  const career = validateCareer(original); const rewards = CASE_REWARDS[caseState?.caseId];
  if (!caseState || caseState.phase !== 'ended' || !rewards || !caseState.ending) throw new Error('只能結算已支援且已結束的案件');
  const runId = caseState.runId ?? career.activeRun?.runId ?? null;
  if (runId && career.settledRuns[runId]) return { career, ...clone(career.settledRuns[runId]), repeated: true };
  if (career.activeRun && runId && career.activeRun.runId !== runId) throw new Error('結算 run 與 active run 不一致');
  const prefix = runId ? `${caseState.caseId}:${runId}` : caseState.caseId; const granted = [];
  for (const milestoneId of caseState.ledger ?? []) { const value = rewards[milestoneId]; if (!value) continue; const rewardId = `${prefix}:xp:${milestoneId}`; if (career.rewardLedger.includes(rewardId)) continue; career.rewardLedger.push(rewardId); career.exp += value; granted.push({ rewardId, value }); }
  const claimedRewards = [];
  const appliedRewards = [];
  for (const reward of caseState.careerRewards ?? []) {
    if (!reward || typeof reward.claimId !== 'string' || !/^reward:[a-z0-9-]{3,96}$/.test(reward.claimId)) continue;
    const rewardId = `${prefix}:${reward.claimId}`;
    if (career.rewardLedger.includes(rewardId)) continue;
    if (reward.kind === 'card' && CARDS[reward.cardId]) career.cards[reward.cardId] = Math.min(CARDS[reward.cardId].maxLevel, (career.cards[reward.cardId] ?? 0) + 1);
    else if (reward.kind === 'shard' && Number.isInteger(reward.amount) && reward.amount > 0) career.cardShards += reward.amount;
    else if (reward.kind === 'career-exp' && Number.isInteger(reward.amount) && reward.amount > 0) career.exp += reward.amount;
    else continue;
    career.rewardLedger.push(rewardId); claimedRewards.push(rewardId); appliedRewards.push(clone(reward));
  }
  for (const claimId of caseState.rewardClaims ?? []) { if (typeof claimId !== 'string' || !/^reward:[a-z0-9-]{3,96}$/.test(claimId)) continue; const rewardId = `${prefix}:${claimId}`; if (career.rewardLedger.includes(rewardId)) continue; career.rewardLedger.push(rewardId); claimedRewards.push(rewardId); }
  for (const [id, level] of Object.entries(caseState.cards ?? {})) if (CARDS[id]) career.cards[id] = Math.max(career.cards[id] ?? 0, Math.min(CARDS[id].maxLevel, Math.max(1, level)));
  const caseId = caseState.caseId; career.loadoutsByCase[caseId] = (caseState.equipped ?? career.loadoutsByCase[caseId]).filter((id) => career.cards[id] && cardApplies(id, caseId)).slice(0, MAX_CASE_LOADOUT);
  const previous = career.completedCases[caseId]; career.completedCases[caseId] = { plays: (previous?.plays ?? 0) + 1, lastEnding: caseState.ending.baseId, lastPlayedAt: now }; career.level = careerLevelForExp(career.exp).level;
  const summary = { granted, claimedRewards, appliedRewards, expGained: granted.reduce((sum, item) => sum + item.value, 0) + appliedRewards.filter((item) => item.kind === 'career-exp').reduce((sum, item) => sum + item.amount, 0) };
  if (runId) career.settledRuns[runId] = clone(summary); career.activeRun = null; career.updatedAt = now;
  return { career: validateCareer(career), ...summary, repeated: false };
}
