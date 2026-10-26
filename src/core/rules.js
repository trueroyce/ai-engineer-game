// v0.3-T3 RuleSet：唯一數字來源為 docs/canonical/game-specification.md §1–§2。
// 其他模組與 UI 一律從這裡讀數值，不得另寫常數。

export const RULE_VERSION = 'v0.3-T3';

function deepFreeze(obj) {
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  }
  return Object.freeze(obj);
}

export const RULES = deepFreeze({
  ruleVersion: RULE_VERSION,
  attributes: { min: 1, max: 3, total: 6, keys: ['A', 'E', 'V'] },
  templates: {
    balanced: { name: '均衡工程師', A: 2, E: 2, V: 2 },
    analyst: { name: '需求分析型', A: 3, E: 2, V: 1 },
    sprinter: { name: '衝刺實作型', A: 1, E: 3, V: 2 },
    verifier: { name: '品質驗證型', A: 2, E: 1, V: 3 },
  },
  totalTurns: 18,
  token: { start: 18, cap: 24 },
  stress: { start: 0, crashAt: 10 },
  xp: { thresholds: [3, 6, 9], maxLevel: 4 },
  slots: 3,
  draft: { openingDraw: 4, openingPick: 2, levelUpDraw: 3 },
  abandonStress: 1,
  expireStress: 1,
  formula: {
    pBase: 50, attrStep: 10, difficultyStep: 10, stressStep: 5, stressDivisor: 3,
    pMin: 20, pMax: 95, qAStep: 5, qPrepReduction: 10, qMin: 5, qMax: 60,
  },
  attributeFor: { analyze: 'A', implement: 'E', rush: 'E', repair: 'E', verify: 'V' },
  actions: {
    analyze: { name: '分析', cost: 2, stress: 0, success: { B: 20, N: 2 }, failure: { B: 10, N: 1 } },
    implement: { name: '普通實作', cost: 3, stress: 1, successP: 2, failureP: 1, qBase: 20 },
    rush: { name: '趕工', cost: 4, stress: 2, successP: 3, failureP: 1, qBase: 40, pPenalty: 10 },
    verify: { name: '驗證', cost: 2, stress: 0 },
    repair: { name: '修復', cost: 2, stress: 1 },
    rest: { name: '休息', cost: 0, token: 4, stress: -3 },
    deliver: { name: '交付', cost: 0, rejectStress: 1 },
  },
  projects: {
    J1: { id: 'J1', name: '待辦工具', difficulty: 0, target: 4, duration: 6, rewardToken: 6, rewardScore: 2 },
    J2: { id: 'J2', name: '資料整合', difficulty: 1, target: 6, duration: 8, rewardToken: 9, rewardScore: 4 },
    J3: { id: 'J3', name: 'Agent原型', difficulty: 2, target: 8, duration: 10, rewardToken: 12, rewardScore: 7 },
  },
  cards: {
    C1: {
      id: 'C1', name: '需求筆記', role: '準備', toggle: false, extraN: [1, 2],
      levels: ['分析結果的準備次數 N 額外 +1（成功 3 次／失敗 2 次）。', '分析結果的準備次數 N 額外 +2（成功 4 次／失敗 3 次）。'],
      cost: '不另花 Token；不追溯修改取得前已有的準備。',
    },
    C2: {
      id: 'C2', name: '快速原型', role: '節省資源', toggle: true, costReduction: [1, 2], qAdd: [5, 5], minCost: 1,
      levels: ['普通實作／趕工可自行開啟：Token −1（最低 1），缺陷風險 q +5。', '普通實作／趕工可自行開啟：Token −2（最低 1），缺陷風險 q 仍 +5。'],
      cost: '開啟才生效，預設關閉；開啟會增加缺陷風險。',
    },
    C3: {
      id: 'C3', name: '測試助手', role: '驗證輔助', toggle: true, extraCost: [1, 1], pAdd: [20, 30],
      levels: ['驗證可加付 1 Token，成功率 +20（最高 95%）。', '驗證可加付 1 Token，成功率 +30（最高 95%）。'],
      cost: '開啟才收費，預設關閉；Token 不足時須自行關閉。',
    },
    C4: {
      id: 'C4', name: '除錯手冊', role: '修復輔助', toggle: false, pAdd: [10, 20],
      levels: ['修復成功率自動 +10（範圍 20–95%）；成功仍只修 1 個已知缺陷。', '修復成功率自動 +20（範圍 20–95%）；成功仍只修 1 個已知缺陷。'],
      cost: '不另收費、不改壓力；不能修未知問題。',
    },
    C5: {
      id: 'C5', name: '節奏管理', role: '休息補給', toggle: false, restToken: [1, 2],
      levels: ['休息額外回復 1 Token（上限 24）。', '休息額外回復 2 Token（上限 24）。'],
      cost: '壓力下降仍為 3，不增加主要行動。',
    },
    C6: {
      id: 'C6', name: '驗收清單', role: '驗收折扣', toggle: false, discount: [1, 1], everyVerification: [false, true], minCost: 0,
      levels: ['每案第一次驗證 Token −1。', '每次驗證 Token −1。'],
      cost: '先減基礎費再加測試助手費；「第一次驗證」標記跟專案走，晚取得或換卡不重置。',
    },
  },
  endings: [
    { id: 'masterpiece', name: '代表作', minScore: 9 },
    { id: 'steady', name: '穩定交付', minScore: 6 },
    { id: 'starter', name: '初階接案', minScore: 2 },
    { id: 'empty', name: '交件落空', minScore: 0 },
  ],
  crashEnding: { id: 'crash', name: '壓力崩潰' },
});

export const CARD_IDS = Object.freeze(Object.keys(RULES.cards));
export const PROJECT_IDS = Object.freeze(Object.keys(RULES.projects));

export function endingForScore(score) {
  if (score === 1) throw new Error('分數 1 在 T3 專案分值下不可能出現');
  const e = RULES.endings.find((x) => score >= x.minScore);
  return { id: e.id, name: e.name };
}
