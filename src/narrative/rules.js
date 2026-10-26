export const RULE_VERSION = 'case-01-narrative@2';

export const SIMULATION_NOTICE = '本遊戲以情境文本演出 Claude Code 操作，不會連線或呼叫真正的 Claude Code。';

export const TEMPLATES = Object.freeze({
  ultimate: {
    id: 'ultimate', name: '終極全能戰士', difficulty: '非常簡單',
    description: '需求、實作、驗證全都能扛。偶爾也會踩雷，但雷通常先道歉。',
    attrs: { A: 10, E: 10, V: 10 },
  },
  analyst: {
    id: 'analyst', name: '需求通靈偵探', difficulty: '簡單',
    description: '擅長把「差不多」翻譯成可以驗收的句子，動手速度普通。',
    attrs: { A: 9, E: 5, V: 6 },
  },
  balanced: {
    id: 'balanced', name: '什麼都會一點社畜', difficulty: '標準',
    description: '沒有神蹟，也沒有明顯短板；靠判斷和咖啡把案子送到終點。',
    attrs: { A: 6, E: 6, V: 6 },
  },
  builder: {
    id: 'builder', name: '凌晨兩點爆肝俠', difficulty: '偏難',
    description: '寫得快得像在逃命，但很可能在問清楚以前就先開工。',
    attrs: { A: 3, E: 9, V: 4 },
  },
  verifier: {
    id: 'verifier', name: 'Bug 法醫', difficulty: '標準偏難',
    description: '能從一個閃爍的按鈕推回整條事故鏈，前期實作與溝通比較保守。',
    attrs: { A: 5, E: 4, V: 9 },
  },
  beginner: {
    id: 'beginner', name: '真初心者', difficulty: '地獄',
    description: '每一步都有學費，每一點 Token 都像最後一片吐司；仍有機會活著交件。',
    attrs: { A: 1, E: 1, V: 1 },
  },
});

export const CARDS = Object.freeze({
  C1: { id: 'C1', name: '需求雷達', description: 'Lv.1：需求工作累積 1 點分析準備。', upgradeDescription: 'Lv.2：一次累積 2 點分析準備，後續實作更穩。', rarity: 'common', drawWeight: 100, maxLevel: 2, effects: [{ type: 'analysisPrep', amount: 1 }] },
  C2: { id: 'C2', name: '快速原型', description: 'Lv.1：原型與實作少花 1 Token，但提高返工風險。', upgradeDescription: 'Lv.2：少花 2 Token；返工風險仍在，但省費非常有感。', rarity: 'common', drawWeight: 100, maxLevel: 2, effects: [{ type: 'resourceCost', actions: ['A05', 'A07'], amount: -1 }, { type: 'eventRisk', actions: ['A05', 'A07'], amount: 5 }] },
  C3: { id: 'C3', name: '測試助手', description: 'Lv.1：付費交叉檢查增加 20% 審查覆蓋。', upgradeDescription: 'Lv.2：交叉檢查提升為 35%，更容易揭露仍未知的缺陷。', rarity: 'common', drawWeight: 100, maxLevel: 2, effects: [{ type: 'reviewCoverage', amount: 20 }] },
  C4: { id: 'C4', name: '除錯助手', description: 'Lv.1：小修復的有利事件權重 +10。', upgradeDescription: 'Lv.2：有利事件權重 +20；修復本身仍不能刷 XP。', rarity: 'common', drawWeight: 100, maxLevel: 2, effects: [{ type: 'eventWeight', actions: ['A11'], amount: 10 }] },
  C5: { id: 'C5', name: '節奏管理', description: 'Lv.1：休息額外恢復 1 Token，並多降壓力。', upgradeDescription: 'Lv.2：休息額外恢復 2 Token，仍多降壓力。', rarity: 'common', drawWeight: 100, maxLevel: 2, effects: [{ type: 'restRecovery', token: 1, stress: 1 }] },
  C6: { id: 'C6', name: '驗收清單', description: 'Lv.1：第一次完整驗證少花 1 Token。', upgradeDescription: 'Lv.2：每次完整驗證都少花 1 Token。', rarity: 'common', drawWeight: 100, maxLevel: 2, effects: [{ type: 'resourceCost', actions: ['A08'], amount: -1, firstOnly: true }] },
});

export const ACTIONS = Object.freeze({
  A01: { id: 'A01', title: '理解需求', cost: 2, ability: 'A', command: '/plan', risk: '問得太空泛，客戶也可能回一個更空泛的答案。' },
  A02: { id: 'A02', title: '把需求翻成工程語言', cost: 1, ability: 'A', command: '/diff', risk: '翻譯過程可能把人話寫得太像合約。' },
  A03: { id: 'A03', title: '把暴大的夢想請回地球', cost: 1, ability: 'A', command: 'Read / Edit', risk: '客戶可能還要先問那個永遠不在場的主管。' },
  A04: { id: 'A04', title: '把「差不多」寫成驗收條件', cost: 2, ability: 'A', command: '/plan → Edit → /diff', risk: '看似完整的規格仍可能帶著舊誤解。' },
  A05: { id: 'A05', title: '做一個能看的小原型', cost: 2, ability: 'E', command: '/plan → Edit → Bash', risk: '按鈕可能比功能更早上班。' },
  A06: { id: 'A06', title: '拿畫面問，不拿形容詞猜', cost: 1, ability: 'A', command: 'Bash → Browser → 對話', risk: '客戶看到畫面可能突然想起「順便」兩個字。' },
  A07: { id: 'A07', title: '把下一塊做成真的功能', cost: 3, ability: 'E', command: '/plan → Edit → Bash → /diff', risk: '實作資料的承諾，通常從第二個檔案開始變重。' },
  A08: { id: 'A08', title: '假裝自己是最難搞的使用者', cost: 2, ability: 'V', command: 'Bash → Browser → 手工操作', risk: '驗證不會因為畫面很漂亮就放水。' },
  A09: { id: 'A09', title: '請另一雙眼睛挑毛病', cost: 2, ability: 'V', command: '/code-review → Bash', risk: '審查指出問題不等於問題已經修好。' },
  A10: { id: 'A10', title: '整理桌面，不是把東西掃進床底', cost: 1, ability: 'A', command: '/context → /compact → /rename', risk: '摘要可能把「準備做」寫成「已完成」。' },
  A11: { id: 'A11', title: '修一下，真的只修一下', cost: 2, ability: 'E', command: '/rewind → Edit → Bash', risk: '程式碼回去了，時間並不會。' },
  A12: { id: 'A12', title: '現在交，還是再修一輪', cost: 0, ability: null, command: '交付檢查', risk: '結局只看目前證據與交付意圖。' },
});

export const LIMITS = Object.freeze({
  token: 24,
  tokenCap: 30,
  stressCap: 10,
  deadline: 12,
  hardWork: 14,
  cardRewardThresholds: [2, 5],
  richToken: 10,
  highStress: 8,
});

export function assertAttributes(attrs) {
  if (!attrs || !['A', 'E', 'V'].every((key) => Number.isInteger(attrs[key]) && attrs[key] >= 1 && attrs[key] <= 10)) {
    throw new Error('A/E/V 必須各為 1–10');
  }
}

export function cardLevel(state, id) {
  return state.cards[id] ?? 0;
}
