import { CARDS } from './cards.js';
import { careerLevelForExp, mergeCardReward, validateCareer } from './state-v2.js';

export const RUN_REWARD_THRESHOLDS = Object.freeze([2, 4]);
const clone = (value) => structuredClone(value);

export function starterChoicesForCareer(careerId, pool = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) {
  let hash = 2166136261;
  for (const char of careerId) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) >>> 0; }
  return pool.map((id, index) => ({ id, score: Math.imul(hash ^ (index + 1), 2654435761) >>> 0 })).sort((a, b) => a.score - b.score).slice(0, 3).map((item) => item.id);
}

export function createRunProgression() {
  return { runExp: 0, progressKeys: [], rewardMilestones: [{ slot: 1, threshold: 2, status: 'locked' }, { slot: 2, threshold: 4, status: 'locked' }], pendingRewardSlot: null, rewardChoices: {}, rewardPicks: {}, careerRewards: [], rewardClaims: [] };
}

export function recordRunProgress(original, progressKey) {
  const state = clone(original);
  if (typeof progressKey !== 'string' || !progressKey) throw new Error('progress key 不合法');
  if (state.progressKeys.includes(progressKey)) return { state, gained: false };
  state.progressKeys.push(progressKey); state.runExp += 1;
  for (const milestone of state.rewardMilestones) if (milestone.status === 'locked' && state.runExp >= milestone.threshold) milestone.status = 'ready';
  const ready = state.rewardMilestones.find((item) => item.status === 'ready');
  if (ready) state.pendingRewardSlot = ready.slot;
  return { state, gained: true };
}

const ALTERNATIVES = Object.freeze([
  { id: 'shard-1', kind: 'shard', amount: 1, title: '靈感碎片 ×1', description: '永久保存；集滿三片可融合任一未滿級卡。' },
  { id: 'shard-2', kind: 'shard', amount: 2, title: '靈感碎片 ×2', description: '快速接近一次自由融合。' },
  { id: 'career-exp-2', kind: 'career-exp', amount: 2, title: '資深費 EXP ×2', description: '全卡滿級時仍有永久職涯價值。' },
]);

export function buildRewardChoices({ cards, pool, slot }) {
  const available = pool.filter((id) => CARDS[id] && (cards[id] ?? 0) < CARDS[id].maxLevel);
  const offset = available.length ? (slot - 1) % available.length : 0;
  const ordered = available.length ? [...available.slice(offset), ...available.slice(0, offset)] : [];
  const choices = ordered.slice(0, 3).map((id) => ({ id: `card-${id}`, kind: 'card', cardId: id, title: CARDS[id].name, description: cards[id] ? CARDS[id].upgradeDescription : CARDS[id].description }));
  for (const alternative of ALTERNATIVES) if (choices.length < 3) choices.push(clone(alternative));
  return choices;
}

export function openRewardChoices(original, { cards, pool }) {
  const state = clone(original); const slot = state.pendingRewardSlot;
  if (!slot) throw new Error('目前沒有待選獎勵');
  if (!state.rewardChoices[slot]) state.rewardChoices[slot] = buildRewardChoices({ cards, pool, slot });
  return { state, slot, choices: clone(state.rewardChoices[slot]) };
}

export function chooseRunReward(original, { slot, choiceId, cards }) {
  const state = clone(original); const milestone = state.rewardMilestones.find((item) => item.slot === slot);
  if (!milestone || !['ready', 'claimed'].includes(milestone.status)) throw new Error('獎勵里程碑尚未開放');
  if (milestone.status === 'claimed') return { state, repeated: true, reward: clone(state.rewardPicks[slot]) };
  const choice = state.rewardChoices[slot]?.find((item) => item.id === choiceId);
  if (!choice) throw new Error('獎勵選項不合法');
  const reward = clone(choice);
  if (choice.kind === 'card') cards[choice.cardId] = Math.min(CARDS[choice.cardId].maxLevel, (cards[choice.cardId] ?? 0) + 1);
  state.careerRewards.push({ ...reward, claimId: `reward:milestone-${slot}` });
  state.rewardClaims.push(`reward:milestone-${slot}`); state.rewardPicks[slot] = reward; milestone.status = 'claimed';
  state.pendingRewardSlot = state.rewardMilestones.find((item) => item.status === 'ready')?.slot ?? null;
  return { state, repeated: false, reward };
}

export function applyPersistentReward(original, reward) {
  let career = validateCareer(original);
  if (reward.kind === 'card') return mergeCardReward(career, reward.cardId).career;
  if (reward.kind === 'shard') career.cardShards += reward.amount;
  if (reward.kind === 'career-exp') { career.exp += reward.amount; career.level = careerLevelForExp(career.exp).level; }
  return career;
}

export function redeemCardShards(original, cardId = null) {
  let career = validateCareer(original);
  if (career.cardShards < 3) throw new Error('靈感碎片不足');
  const eligible = Object.keys(career.cards).filter((id) => (career.cards[id] ?? 0) < CARDS[id].maxLevel);
  if (eligible.length) {
    if (!eligible.includes(cardId)) throw new Error('請選擇一張未滿級卡片');
    career.cardShards -= 3; career = mergeCardReward(career, cardId).career;
    return { career, kind: 'fusion', cardId };
  }
  career.cardShards -= 3; career.exp += 2; career.level = careerLevelForExp(career.exp).level;
  return { career, kind: 'career-exp', amount: 2 };
}
