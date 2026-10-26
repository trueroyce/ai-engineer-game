import { CARDS, TEMPLATES } from '../narrative/rules.js';

export const CAREER_SCHEMA_VERSION = 'ai-engineer-game.career.v1';
export const CAREER_STORAGE_KEY = 'ai-engineer-game.career.v1';
export const MAX_EQUIPPED_CARDS = 3;

export const CAREER_LEVELS = Object.freeze([
  { level: 1, minExp: 0, title: '剛打開終端機' },
  { level: 2, minExp: 4, title: '開始會留證據' },
  { level: 3, minExp: 9, title: '能把案子帶回家' },
  { level: 4, minExp: 15, title: '需求變更倖存者' },
]);

const CASE_REWARDS = Object.freeze({
  'case-01': Object.freeze({
    requirements_clear: 1,
    confirmed_spec: 1,
    working_core: 1,
    persistence_correct: 1,
    full_verification: 1,
    limited_trial: 1,
    final_delivery: 2,
  }),
  'case-02': Object.freeze({
    contract_aligned: 1,
    sources_normalized: 1,
    truth_reconciled: 1,
    change_contracted: 1,
    cross_source_tests: 1,
    audit_trace: 1,
    verified_delivery: 2,
  }),
  'case-03': Object.freeze({
    requirements_decided: 1,
    interface_approved: 1,
    implementation_complete: 1,
    merge_reviewed: 1,
    change_contracted: 1,
    current_evidence: 1,
    verified_delivery: 2,
  }),
});

const clone = (value) => structuredClone(value);

export function careerLevelForExp(exp) {
  return [...CAREER_LEVELS].reverse().find((entry) => exp >= entry.minExp) ?? CAREER_LEVELS[0];
}

export function createCareer({ careerId, templateId, now = new Date().toISOString() }) {
  if (typeof careerId !== 'string' || !/^[a-z0-9][a-z0-9-]{7,63}$/.test(careerId)) throw new Error('careerId 格式不合法');
  if (!TEMPLATES[templateId]) throw new Error('未知角色');
  return {
    schemaVersion: CAREER_SCHEMA_VERSION,
    careerId,
    templateId,
    exp: 0,
    level: 1,
    cards: {},
    equipped: [],
    rewardLedger: [],
    completedCases: {},
    createdAt: now,
    updatedAt: now,
  };
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必須是 object`);
}

export function validateCareer(input) {
  assertPlainObject(input, 'career');
  const career = clone(input);
  const exact = ['schemaVersion', 'careerId', 'templateId', 'exp', 'level', 'cards', 'equipped', 'rewardLedger', 'completedCases', 'createdAt', 'updatedAt'];
  if (Object.keys(career).some((key) => !exact.includes(key))) throw new Error('career 含未知欄位');
  if (career.schemaVersion !== CAREER_SCHEMA_VERSION) throw new Error('不支援的職涯版本');
  if (typeof career.careerId !== 'string' || !/^[a-z0-9][a-z0-9-]{7,63}$/.test(career.careerId)) throw new Error('careerId 格式不合法');
  if (!TEMPLATES[career.templateId]) throw new Error('未知角色');
  if (!Number.isInteger(career.exp) || career.exp < 0 || career.exp > 9999) throw new Error('EXP 不合法');
  const level = careerLevelForExp(career.exp).level;
  if (career.level !== level) throw new Error('等級與 EXP 不一致');
  assertPlainObject(career.cards, 'cards');
  for (const [id, cardLevel] of Object.entries(career.cards)) {
    if (!CARDS[id] || !Number.isInteger(cardLevel) || cardLevel < 1 || cardLevel > CARDS[id].maxLevel) throw new Error('卡庫不合法');
  }
  if (!Array.isArray(career.equipped) || career.equipped.length > MAX_EQUIPPED_CARDS || new Set(career.equipped).size !== career.equipped.length) throw new Error('啟用卡不合法');
  if (career.equipped.some((id) => !career.cards[id])) throw new Error('啟用卡必須已持有');
  if (!Array.isArray(career.rewardLedger) || new Set(career.rewardLedger).size !== career.rewardLedger.length || career.rewardLedger.some((id) => typeof id !== 'string' || id.length > 96)) throw new Error('獎勵帳本不合法');
  assertPlainObject(career.completedCases, 'completedCases');
  for (const summary of Object.values(career.completedCases)) {
    assertPlainObject(summary, 'completed case');
    if (!Number.isInteger(summary.plays) || summary.plays < 1 || typeof summary.lastEnding !== 'string' || typeof summary.lastPlayedAt !== 'string') throw new Error('案件摘要不合法');
  }
  if (typeof career.createdAt !== 'string' || typeof career.updatedAt !== 'string') throw new Error('時間欄位不合法');
  return career;
}

export function encodeCareer(career, now = new Date().toISOString()) {
  const next = validateCareer({ ...clone(career), updatedAt: now });
  return JSON.stringify({ schemaVersion: CAREER_SCHEMA_VERSION, savedAt: now, career: next });
}

export function decodeCareer(text) {
  let envelope;
  try { envelope = JSON.parse(text); } catch { return { status: 'invalid', reason: '存檔不是有效 JSON' }; }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return { status: 'invalid', reason: '存檔外層格式錯誤' };
  if (envelope.schemaVersion !== CAREER_SCHEMA_VERSION) return { status: 'unsupported', reason: `不支援的存檔版本：${String(envelope.schemaVersion)}` };
  try { return { status: 'ready', career: validateCareer(envelope.career) }; }
  catch (error) { return { status: 'invalid', reason: error.message }; }
}

export function loadCareer(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(CAREER_STORAGE_KEY);
    if (raw === null) return { status: 'empty' };
    return { ...decodeCareer(raw), raw };
  } catch (error) {
    return { status: 'unavailable', reason: `瀏覽器本機儲存不可用：${error.message}` };
  }
}

export function saveCareer(career, storage = globalThis.localStorage, now = new Date().toISOString()) {
  const text = encodeCareer(career, now);
  storage.setItem(CAREER_STORAGE_KEY, text);
  return decodeCareer(text).career;
}

export function resetCareer(storage = globalThis.localStorage) {
  storage.removeItem(CAREER_STORAGE_KEY);
}

export function toggleEquipped(original, cardId) {
  const career = validateCareer(original);
  if (!career.cards[cardId]) throw new Error('尚未持有這張卡');
  if (career.equipped.includes(cardId)) career.equipped = career.equipped.filter((id) => id !== cardId);
  else {
    if (career.equipped.length >= MAX_EQUIPPED_CARDS) throw new Error('最多啟用 3 張；先停用一張再換裝');
    career.equipped.push(cardId);
  }
  return career;
}

export function mergeCardReward(original, cardId) {
  const career = validateCareer(original);
  const card = CARDS[cardId];
  if (!card) throw new Error('未知卡片');
  const previousLevel = career.cards[cardId] ?? 0;
  career.cards[cardId] = Math.min(card.maxLevel, previousLevel + 1);
  let disposition = previousLevel ? 'fused' : 'collected';
  if (!career.equipped.includes(cardId) && career.equipped.length < MAX_EQUIPPED_CARDS) {
    career.equipped.push(cardId);
    disposition = previousLevel ? 'fused' : 'equipped';
  }
  return { career, disposition, previousLevel, level: career.cards[cardId] };
}

export function settleCase(original, caseState, now = new Date().toISOString()) {
  const career = validateCareer(original);
  const rewards = CASE_REWARDS[caseState?.caseId];
  if (!caseState || caseState.phase !== 'ended' || !rewards || !caseState.ending) throw new Error('只能結算已支援且已結束的案件');
  const granted = [];
  for (const milestoneId of caseState.ledger ?? []) {
    const value = rewards[milestoneId];
    if (!value) continue;
    const rewardId = `${caseState.caseId}:${milestoneId}`;
    if (career.rewardLedger.includes(rewardId)) continue;
    career.rewardLedger.push(rewardId);
    career.exp += value;
    granted.push({ rewardId, value });
  }
  const claimedRewards = [];
  for (const claimId of caseState.rewardClaims ?? []) {
    if (typeof claimId !== 'string' || !/^reward:[a-z0-9-]{3,64}$/.test(claimId)) continue;
    const rewardId = `${caseState.caseId}:${claimId}`;
    if (career.rewardLedger.includes(rewardId)) continue;
    career.rewardLedger.push(rewardId);
    claimedRewards.push(rewardId);
  }
  career.level = careerLevelForExp(career.exp).level;
  career.cards = {};
  for (const [id, level] of Object.entries(caseState.cards ?? {})) {
    if (CARDS[id]) career.cards[id] = Math.min(CARDS[id].maxLevel, Math.max(1, level));
  }
  if (caseState.caseId === 'case-01' && Array.isArray(caseState.careerEquippedSnapshot)) {
    const beforeCards = caseState.careerCardsSnapshot ?? {};
    career.equipped = caseState.careerEquippedSnapshot.filter((id) => career.cards[id]).slice(0, MAX_EQUIPPED_CARDS);
    for (const id of caseState.equipped ?? []) {
      if (!beforeCards[id] && career.cards[id] && !career.equipped.includes(id) && career.equipped.length < MAX_EQUIPPED_CARDS) career.equipped.push(id);
    }
  } else career.equipped = (caseState.equipped ?? []).filter((id) => career.cards[id]).slice(0, MAX_EQUIPPED_CARDS);
  const previous = career.completedCases[caseState.caseId];
  career.completedCases[caseState.caseId] = {
    plays: (previous?.plays ?? 0) + 1,
    lastEnding: caseState.ending.baseId,
    lastPlayedAt: now,
  };
  career.updatedAt = now;
  validateCareer(career);
  return { career, granted, claimedRewards, expGained: granted.reduce((sum, item) => sum + item.value, 0) };
}
