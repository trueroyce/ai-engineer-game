import { cardUses, effectValue, synergyIds } from '../career/cards.js';

export const RETRY_BONUSES = Object.freeze([12, 8, 4, 2]);
export const LEARNING_CAP = 26;
export const RECENT_EVENT_MULTIPLIER = 0.25;
const clone = (value) => structuredClone(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createAttemptState() {
  return { revision: 'r1', learning: {}, retryCounts: {}, semanticVersions: {}, recentFailures: {}, eventCounts: {}, operationCache: {}, semanticCache: {}, cardUsage: {}, evidence: {} };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function revisionBucket(state) {
  if (!state.learning[state.revision]) state.learning[state.revision] = {};
  if (!state.retryCounts[state.revision]) state.retryCounts[state.revision] = {};
  return { learning: state.learning[state.revision], retries: state.retryCounts[state.revision] };
}

export function previewRetry(original, { semanticKey, tokenCost = 1, timeCost = 1, cards = {}, equipped = [] }) {
  const state = clone(original); const bucket = revisionBucket(state); const count = bucket.retries[semanticKey] ?? 0;
  const base = RETRY_BONUSES[Math.min(count, RETRY_BONUSES.length - 1)];
  const c13 = count === 0 ? effectValue(cards, equipped, 'C13', 'retryLearning', 0) : 0;
  const synergy = count === 0 && synergyIds(cards, equipped).includes('requirements-archaeologists') ? 2 : 0;
  const level = equipped.includes('C13') ? cards.C13 ?? 0 : 0;
  return { tokenCost, timeCost: Math.max(0, timeCost - (level >= 2 ? 1 : 0)), learningGain: Math.min(base + c13 + synergy, Math.max(0, LEARNING_CAP - (bucket.learning[semanticKey] ?? 0))), currentLearning: bucket.learning[semanticKey] ?? 0 };
}

export function payRetry(original, request) {
  const state = clone(original); const preview = previewRetry(state, request);
  if ((request.token ?? 0) < preview.tokenCost || (request.time ?? 0) < preview.timeCost) throw new Error('重試資源不足');
  const bucket = revisionBucket(state); bucket.learning[request.semanticKey] = Math.min(LEARNING_CAP, (bucket.learning[request.semanticKey] ?? 0) + preview.learningGain);
  bucket.retries[request.semanticKey] = (bucket.retries[request.semanticKey] ?? 0) + 1;
  state.semanticVersions[request.semanticKey] = (state.semanticVersions[request.semanticKey] ?? 0) + 1;
  return { state, token: request.token - preview.tokenCost, time: request.time - preview.timeCost, preview };
}

export function eventWeights(events, recentId) {
  return events.map((event) => ({ ...event, effectiveWeight: event.id === recentId ? event.weight * RECENT_EVENT_MULTIPLIER : event.weight }));
}

function pickWeighted(events, draw) {
  const total = events.reduce((sum, event) => sum + event.effectiveWeight, 0);
  if (!(total > 0)) throw new Error('失敗事件池為空');
  let cursor = clamp(Number(draw), 1, total);
  for (const event of events) { cursor -= event.effectiveWeight; if (cursor <= 0) return event; }
  return events.at(-1);
}

export function previewAttempt(state, request) {
  const learning = state.learning?.[state.revision]?.[request.semanticKey] ?? 0;
  const cardBonus = effectValue(request.cards, request.equipped, 'C18', 'boundaryRadar', 0);
  const modifiers = [...(request.modifiers ?? []), ...(cardBonus && request.boundaryAction ? [{ id: 'C18', label: '責任邊界雷達', value: cardBonus }] : [])];
  const chance = clamp(request.baseChance + learning + modifiers.reduce((sum, item) => sum + item.value, 0), request.minChance ?? 5, request.maxChance ?? 95);
  return { chance, learning, modifiers, partialMargin: request.partialMargin ?? 0 };
}

export function resolveAttempt(original, request, draws) {
  const state = clone(original); const fingerprint = stable({ ...request, cards: request.cards ?? {}, equipped: request.equipped ?? [] });
  const cached = state.operationCache[request.operationId];
  if (cached) { if (cached.fingerprint !== fingerprint) throw new Error('operation_id_conflict'); return { state, result: clone(cached.result), repeated: true }; }
  const version = state.semanticVersions[request.semanticKey] ?? 0;
  const semanticCacheKey = `${state.revision}:${request.semanticKey}:${version}`;
  if (state.semanticCache[semanticCacheKey]) {
    const result = clone(state.semanticCache[semanticCacheKey]); state.operationCache[request.operationId] = { fingerprint, result };
    return { state, result, repeated: true };
  }
  const preview = previewAttempt(state, request); const successDraw = Number(typeof draws.success === 'function' ? draws.success() : draws.success);
  if (!Number.isInteger(successDraw) || successDraw < 1 || successDraw > 100) throw new Error('success draw 必須為 1..100');
  let outcome = successDraw <= preview.chance ? 'success' : 'failure';
  let cardTrigger = null; const nearMissUses = cardUses(request.cards, request.equipped, 'C14', 'nearMissPartial');
  const c14Used = state.cardUsage.C14 ?? 0;
  if (outcome === 'failure' && nearMissUses > c14Used && successDraw <= preview.chance + 5) { outcome = 'partial'; cardTrigger = 'C14'; state.cardUsage.C14 = c14Used + 1; }
  else if (outcome === 'failure' && preview.partialMargin > 0 && successDraw <= preview.chance + preview.partialMargin) outcome = 'partial';
  let failureEvent = null; let sequel = 0;
  if (outcome === 'failure') {
    const weights = eventWeights(request.events ?? [], state.recentFailures[request.semanticKey]);
    const eventDraw = Number(typeof draws.event === 'function' ? draws.event(weights.reduce((sum, item) => sum + item.effectiveWeight, 0)) : draws.event);
    const picked = pickWeighted(weights, eventDraw); failureEvent = picked.id;
    state.recentFailures[request.semanticKey] = picked.id;
    if (!state.eventCounts[request.semanticKey]) state.eventCounts[request.semanticKey] = {};
    sequel = (state.eventCounts[request.semanticKey][picked.id] ?? 0) + 1; state.eventCounts[request.semanticKey][picked.id] = sequel;
    const sequelBonus = effectValue(request.cards, request.equipped, 'C17', 'sequelRecovery', 0);
    if (sequel > 1 && sequelBonus) {
      const bucket = revisionBucket(state); bucket.learning[request.semanticKey] = Math.min(LEARNING_CAP, (bucket.learning[request.semanticKey] ?? 0) + sequelBonus + (synergyIds(request.cards, request.equipped).includes('requirements-archaeologists') ? 2 : 0));
    }
  }
  const result = { outcome, successDraw, chance: preview.chance, learning: preview.learning, modifiers: preview.modifiers, failureEvent, sequel, cardTrigger };
  state.operationCache[request.operationId] = { fingerprint, result: clone(result) }; state.semanticCache[semanticCacheKey] = clone(result);
  return { state, result, repeated: false };
}

export function applyRequirementRevision(original, { revision, kind, affectedKeys }) {
  if (!['minor', 'major'].includes(kind) || typeof revision !== 'string' || !Array.isArray(affectedKeys)) throw new Error('需求修訂參數不合法');
  const state = clone(original); const oldLearning = state.learning[state.revision] ?? {}; const oldRetries = state.retryCounts[state.revision] ?? {};
  state.revision = revision; state.learning[revision] = { ...oldLearning }; state.retryCounts[revision] = { ...oldRetries };
  for (const key of affectedKeys) {
    state.learning[revision][key] = kind === 'minor' ? Math.floor((oldLearning[key] ?? 0) / 2) : 0;
    state.retryCounts[revision][key] = kind === 'minor' ? Math.floor((oldRetries[key] ?? 0) / 2) : 0;
    delete state.recentFailures[key]; delete state.eventCounts[key]; state.semanticVersions[key] = (state.semanticVersions[key] ?? 0) + 1;
    if (kind === 'major') delete state.evidence[key];
    else if (state.evidence[key]) state.evidence[key] = { ...state.evidence[key], status: 'needs-confirmation', revision };
  }
  return state;
}
