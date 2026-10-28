import { cardUses, effectValue, synergyIds } from './cards.js';

const clone = (value) => structuredClone(value);

export function previewOverclockEffects({ cards = {}, equipped = [], action }) {
  const effects = [];
  if (action.kind === 'retry') {
    const amount = effectValue(cards, equipped, 'C13', 'retryLearning', 0);
    if (amount) effects.push({ cardId: 'C13', label: '額外理解', value: amount, unit: '點' });
  }
  if (action.kind === 'boundary') {
    const amount = effectValue(cards, equipped, 'C18', 'boundaryRadar', 0);
    if (amount) effects.push({ cardId: 'C18', label: '責任門檻修正', value: amount, unit: '%' });
  }
  if ((action.tokenCost ?? 0) >= 3) {
    const uses = cardUses(cards, equipped, 'C16', 'largeSpendRefund');
    if (uses) effects.push({ cardId: 'C16', label: '大額支出返還', value: 1, unit: 'Token', maxUses: uses });
  }
  if (action.addsIntegrationDebt) {
    const amount = effectValue(cards, equipped, 'C15', 'integrationShield', 0);
    if (amount) effects.push({ cardId: 'C15', label: '整合債減免', value: amount, unit: '級' });
  }
  if (action.isSequel) {
    const amount = effectValue(cards, equipped, 'C17', 'sequelRecovery', 0);
    if (amount) effects.push({ cardId: 'C17', label: '續篇理解', value: amount, unit: '點' });
  }
  return { effects, synergies: synergyIds(cards, equipped) };
}

export function applySpendRefund(original, { cards = {}, equipped = [], tokenCost }) {
  const state = clone(original); const maxUses = cardUses(cards, equipped, 'C16', 'largeSpendRefund'); const used = state.cardUsage?.C16 ?? 0;
  if (tokenCost < 3 || used >= maxUses) return { state, refunded: 0 };
  if (!state.cardUsage) state.cardUsage = {}; state.cardUsage.C16 = used + 1; state.token += 1;
  return { state, refunded: 1 };
}

export function applyIntegrationShield(original, { cards = {}, equipped = [], debt = 1 }) {
  const state = clone(original); const shield = effectValue(cards, equipped, 'C15', 'integrationShield', 0); const used = state.cardUsage?.C15 ?? 0;
  if (!shield || used) { state.integrationDebt = (state.integrationDebt ?? 0) + debt; return { state, prevented: 0 }; }
  if (!state.cardUsage) state.cardUsage = {}; state.cardUsage.C15 = 1; const prevented = Math.min(shield, debt); state.integrationDebt = (state.integrationDebt ?? 0) + debt - prevented;
  return { state, prevented };
}

export function applyMajorChangeEvidence(original, { cards = {}, equipped = [], directKeys = [], indirectKeys = [] }) {
  const state = clone(original); const preserved = [];
  for (const key of directKeys) delete state.evidence[key];
  const radarLevel = equipped.includes('C18') ? cards.C18 ?? 0 : 0;
  const blastSynergy = synergyIds(cards, equipped).includes('boundary-blast-shield');
  let allowance = radarLevel >= 2 ? 1 : 0; if (blastSynergy) allowance += 1;
  for (const key of indirectKeys) {
    if (allowance > 0 && state.evidence[key]) { preserved.push(key); allowance -= 1; }
    else delete state.evidence[key];
  }
  return { state, preserved };
}
