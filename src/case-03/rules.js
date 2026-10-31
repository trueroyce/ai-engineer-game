export const CASE03_RULE_VERSION = 'case-03-booking@2';

export const CASE03_LIMITS = Object.freeze({ token: 18, tokenCap: 24, stressCap: 10, deadline: 12 });

export function case03StartingResources(templateId) {
  return Object.freeze({
    token: CASE03_LIMITS.token + (templateId === 'beginner' ? 4 : templateId === 'ultimate' ? 5 : 0),
    stress: 0,
    time: CASE03_LIMITS.deadline + (templateId === 'beginner' ? 2 : templateId === 'ultimate' ? 3 : 0),
    overtime: 0,
    workCount: 0,
  });
}

export const CASE03_ACTIONS = Object.freeze({
  C01: { id: 'C01', title: '把「只改一點點」拆成決策', tutorial: '客戶、設計師與工程師各自說得有道理；先把衝突寫成客戶能回答的問題。' },
  C02: { id: 'C02', title: '簽下預約介面契約', tutorial: '時區、取消與重複借用必須由玩家請客戶決定；agent 不能代替客戶點頭。' },
  C03: { id: 'C03', title: '安排 NPC 與模擬 agent 分工', tutorial: '獨作、NPC 結對或模擬 agent 都能完成，但時間、Token 與整合債不同。' },
  C04: { id: 'C04', title: '合併並做 review', tutorial: '把設計師元件與工程師 API 接起來；快合併會省時間，也會留下公開債務。' },
  C05: { id: 'C05', title: '處理下午四點的需求變更', tutorial: '客戶想把借用上限「順便」改掉；要協商、接受代價，或留下未決事項。' },
  C06: { id: 'C06', title: '重跑預約回歸與追溯', tutorial: '每次介面或需求 revision 改變，舊證據就失效；測試不是護身符刺青。' },
  C08: { id: 'C08', title: '修復合併債與失效證據', tutorial: '失敗不會鎖死；付出新成本，取得下一個事件，再把狀態修回可交付。' },
  C07: { id: 'C07', title: '交付、有限試用或止損', tutorial: '依目前公開證據選擇結案方式；不會把缺口改名成成功。' },
  C09: { id: 'C09', title: '失敗後改走原型、縮限或救援', tutorial: '不用只按原動作重骰；補救會留下不同範圍、責任與後續成本。' },
  C10: { id: 'C10', title: '成功後鎖住成果或繼續加碼', tutorial: '穩定切片、品質改善與貪心擴張會改變後續需求與證據。' },
  C11: { id: 'C11', title: '處理延後回來的責任與接口', tutorial: '決策問題、介面問題各自處理；隔離可保住切片，但不會假裝已修復。' },
});

export const CASE03_REWARD_ID = 'case-03:reward:handoff-kit';
export const CASE03_REWARD_POOL = Object.freeze(['C7', 'C8', 'C9', 'C10', 'C11', 'C12']);

export const STRATEGIES = Object.freeze({
  solo: { label: '獨作：自己接 UI 與 API', token: 2, time: 3, stress: 1, debt: 0, bonus: 10 },
  pair: { label: 'NPC 結對：設計師＋工程師', token: 3, time: 2, stress: 1, debt: 0, bonus: 0 },
  agent: { label: '模擬 agent：產生接線草稿', token: 4, time: 1, stress: 2, debt: 1, bonus: -5 },
});
