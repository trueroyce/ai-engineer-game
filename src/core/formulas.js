// p／q／cost 純函式。clamp 次序依 v0.3-T3：
// - 通用 p = clamp(50+10×屬性−10×D−5×floor(S/3)+B, 20, 95)，分析不加 B
// - 趕工：通用 p 再 −10，再次 clamp 20..95
// - C3（驗證，開啟）：通用 p +20/+30，再 clamp（最高 95）
// - C4（修復，自動）：通用 p +10/+20，再 clamp 20..95
// - q = clamp(基準 −5×(A−1) −(消耗準備?10:0) +(C2 開啟?5:0), 5, 60)，只有普通實作與趕工
// - 費用：基礎 → C2（最低 1）→ C6（最低 0）→ C3 加費
import { RULES } from './rules.js';

const F = RULES.formula;
const PREP_ACTIONS = new Set(['implement', 'rush', 'verify', 'repair']);

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const clampP = (x) => clamp(x, F.pMin, F.pMax);
export const clampQ = (x) => clamp(x, F.qMin, F.qMax);

export function cardLevel(equipped, id) {
  return equipped.find((c) => c.id === id)?.level ?? 0;
}

function toggleOn(equipped, toggles, id) {
  if (!toggles?.[id]) return false;
  if (!cardLevel(equipped, id)) throw new Error(`${id} 未持有，不能開啟`);
  return true;
}

export function usesPreparation(action, preparation) {
  return PREP_ACTIONS.has(action) && preparation.N > 0;
}

export function computeP({ action, attributes, difficulty, stress, preparation, equipped, toggles }) {
  const attrKey = RULES.attributeFor[action];
  if (!attrKey) return { p: null, raw: null, general: null, steps: [], usesPreparation: false };
  const usesPrep = usesPreparation(action, preparation);
  const B = usesPrep ? preparation.B : 0;
  const stressPenalty = F.stressStep * Math.floor(stress / F.stressDivisor);
  const steps = [
    { label: '基礎', delta: F.pBase },
    { label: `${attrKey}×${F.attrStep}`, delta: F.attrStep * attributes[attrKey] },
    { label: `難度 D${difficulty}`, delta: -F.difficultyStep * difficulty },
    { label: `壓力 floor(${stress}/3)×5`, delta: -stressPenalty },
  ];
  if (usesPrep) steps.push({ label: '準備 B', delta: B });
  const raw = F.pBase + F.attrStep * attributes[attrKey] - F.difficultyStep * difficulty - stressPenalty + B;
  const general = clampP(raw);
  let p = general;
  const post = [];
  if (action === 'rush') {
    p = clampP(general - RULES.actions.rush.pPenalty);
    post.push({ label: '趕工', delta: -RULES.actions.rush.pPenalty });
  }
  if (action === 'verify' && toggleOn(equipped, toggles, 'C3')) {
    const add = RULES.cards.C3.pAdd[cardLevel(equipped, 'C3') - 1];
    p = clampP(general + add);
    post.push({ label: `C3 測試助手 L${cardLevel(equipped, 'C3')}`, delta: add });
  }
  if (action === 'repair' && cardLevel(equipped, 'C4')) {
    const add = RULES.cards.C4.pAdd[cardLevel(equipped, 'C4') - 1];
    p = clampP(general + add);
    post.push({ label: `C4 除錯手冊 L${cardLevel(equipped, 'C4')}`, delta: add });
  }
  return { p, raw, general, steps, post, usesPreparation: usesPrep };
}

export function computeQ({ action, attributes, consumesPreparation, equipped, toggles }) {
  const base = RULES.actions[action]?.qBase;
  if (base === undefined) return { q: null, raw: null, parts: [] };
  const parts = [
    { label: action === 'rush' ? '趕工基準' : '普通基準', delta: base },
    { label: `A−1=${attributes.A - 1}，×5`, delta: -F.qAStep * (attributes.A - 1) },
  ];
  if (consumesPreparation) parts.push({ label: '本次消耗準備', delta: -F.qPrepReduction });
  if (toggleOn(equipped, toggles, 'C2')) {
    parts.push({ label: 'C2 快速原型', delta: RULES.cards.C2.qAdd[cardLevel(equipped, 'C2') - 1] });
  }
  const raw = parts.reduce((s, x) => s + x.delta, 0);
  return { q: clampQ(raw), raw, parts };
}

export function computeCost({ action, equipped, toggles, project }) {
  const base = RULES.actions[action].cost;
  const parts = [{ source: 'base', label: '基礎', delta: base }];
  let cost = base;
  if ((action === 'implement' || action === 'rush') && toggleOn(equipped, toggles, 'C2')) {
    const next = Math.max(cost - RULES.cards.C2.costReduction[cardLevel(equipped, 'C2') - 1], RULES.cards.C2.minCost);
    parts.push({ source: 'C2', label: 'C2 快速原型', delta: next - cost });
    cost = next;
  }
  if (action === 'verify') {
    const lv = cardLevel(equipped, 'C6');
    if (lv && (RULES.cards.C6.everyVerification[lv - 1] || !project?.firstVerificationUsed)) {
      const next = Math.max(cost - RULES.cards.C6.discount[lv - 1], RULES.cards.C6.minCost);
      parts.push({ source: 'C6', label: lv === 1 ? 'C6 驗收清單（本案首次驗證）' : 'C6 驗收清單', delta: next - cost });
      cost = next;
    }
    if (toggleOn(equipped, toggles, 'C3')) {
      const add = RULES.cards.C3.extraCost[cardLevel(equipped, 'C3') - 1];
      parts.push({ source: 'C3', label: 'C3 測試助手', delta: add });
      cost += add;
    }
  }
  return { cost, parts };
}
