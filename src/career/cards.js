import { CARDS as LEGACY_CARDS } from '../narrative/rules.js';

export const CASE_IDS = Object.freeze(['case-01', 'case-02', 'case-03']);

const universal = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
const normalizeLegacy = Object.fromEntries(Object.entries(LEGACY_CARDS).map(([id, card]) => [id, Object.freeze({
  ...card,
  cases: Object.freeze(universal.has(id) ? [...CASE_IDS] : ['case-02', 'case-03']),
})]));

const NEW_CARDS = {
  C13: { id: 'C13', name: '需求翻譯器', rarity: 'overclock', drawWeight: 80, maxLevel: 2, description: 'Lv.1：每項工作的第一次付費重試，Token 成本降低 1（最低 1 Token），並額外取得 4 點理解。', upgradeDescription: 'Lv.2：額外理解提高為 6 點，並再少花 1 時間。', cases: [...CASE_IDS], effects: [{ type: 'retryLearning', amount: 4, fusedAmount: 6, tokenDiscount: 1, timeDiscountAt: 2 }] },
  C14: { id: 'C14', name: '機率超頻鈕', rarity: 'overclock', drawWeight: 70, maxLevel: 2, description: 'Lv.1：每局一次，差門檻 5 以內的失敗轉成有代價的部分成功。', upgradeDescription: 'Lv.2：每局可觸發兩次；仍會留下明示代價。', cases: [...CASE_IDS], effects: [{ type: 'nearMissPartial', margin: 5, uses: 1, fusedUses: 2 }] },
  C15: { id: 'C15', name: 'Merge 防爆毯', rarity: 'overclock', drawWeight: 75, maxLevel: 2, description: 'Lv.1：每局第一次新增整合債或衝突時降低 1 級。', upgradeDescription: 'Lv.2：同時保留一份未被直接影響的證據。', cases: ['case-02', 'case-03'], effects: [{ type: 'integrationShield', amount: 1, preserveEvidenceAt: 2 }] },
  C16: { id: 'C16', name: 'Token 反芻胃', rarity: 'overclock', drawWeight: 65, maxLevel: 2, description: 'Lv.1：單次工作花費至少 3 Token 時，每局返還一次 1 Token。', upgradeDescription: 'Lv.2：每局可返還兩次；成本不會低於 1。', cases: [...CASE_IDS], effects: [{ type: 'largeSpendRefund', threshold: 3, amount: 1, uses: 1, fusedUses: 2 }] },
  C17: { id: 'C17', name: '續篇編劇', rarity: 'overclock', drawWeight: 75, maxLevel: 2, description: 'Lv.1：重遇同一失敗事件時增加 4 點補救理解。', upgradeDescription: 'Lv.2：續篇補救再少花 1 時間。', cases: ['case-02', 'case-03'], effects: [{ type: 'sequelRecovery', amount: 4, timeDiscountAt: 2 }] },
  C18: { id: 'C18', name: '責任邊界雷達', rarity: 'overclock', drawWeight: 70, maxLevel: 2, description: 'Lv.1：契約／review 成功率 +8，並預告一個公開責任風險。', upgradeDescription: 'Lv.2：加成提高為 +12；重大變更可保留一份未直接受影響證據。', cases: ['case-02', 'case-03'], effects: [{ type: 'boundaryRadar', amount: 8, fusedAmount: 12, preserveEvidenceAt: 2 }] },
};

export const CARDS = Object.freeze({ ...normalizeLegacy, ...Object.fromEntries(Object.entries(NEW_CARDS).map(([id, card]) => [id, Object.freeze({ ...card, cases: Object.freeze(card.cases), effects: Object.freeze(card.effects) })])) });
export const STARTER_CARD_IDS = Object.freeze(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
export const MAX_FUSION_LEVEL = 2;
export const MAX_CASE_LOADOUT = 3;

export function cardApplies(cardId, caseId) { return Boolean(CARDS[cardId]?.cases.includes(caseId)); }
export function cardLevel(cards, cardId) { return Math.max(0, Math.min(CARDS[cardId]?.maxLevel ?? 0, cards?.[cardId] ?? 0)); }
export function activeCardLevel(state, cardId) { return state?.equipped?.includes(cardId) ? cardLevel(state.cards, cardId) : 0; }

export function effectValue(cards, equipped, cardId, key, fallback = 0) {
  const level = equipped?.includes(cardId) ? cardLevel(cards, cardId) : 0;
  if (!level) return fallback;
  const effect = CARDS[cardId].effects.find((item) => item.type === key);
  if (!effect) return fallback;
  return level >= 2 ? (effect.fusedAmount ?? effect.amount ?? fallback) : (effect.amount ?? fallback);
}

export function cardUses(cards, equipped, cardId, key) {
  const level = equipped?.includes(cardId) ? cardLevel(cards, cardId) : 0;
  if (!level) return 0;
  const effect = CARDS[cardId].effects.find((item) => item.type === key);
  return level >= 2 ? (effect?.fusedUses ?? effect?.uses ?? 0) : (effect?.uses ?? 0);
}

export function synergyIds(cards, equipped) {
  const has = (id) => equipped?.includes(id) && cardLevel(cards, id) > 0;
  return [...(has('C13') && has('C17') ? ['requirements-archaeologists'] : []), ...(has('C15') && has('C18') ? ['boundary-blast-shield'] : [])];
}
