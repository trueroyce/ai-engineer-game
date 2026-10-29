export const CASE04_RULE_VERSION = 'case-04-legacy@1';
export const CASE04_LIMITS = Object.freeze({ token: 18, tokenCap: 24, stressCap: 10, deadline: 12 });

export const CASE04_ACTIONS = Object.freeze({
  D01: { id: 'D01', title: '把「昨天還好好的」變成可重現事故', tutorial: '先讀 log、重現與比對昨天版本；猜到不算找到。' },
  D02: { id: 'D02', title: '選一條救火策略', tutorial: '補丁、根因調查、局部重構與回滾各有公開代價。' },
  D03: { id: 'D03', title: '執行第一輪穩定化', tutorial: '讓模擬 agent 分查程式、測試與部署；矛盾診斷仍由玩家決定。' },
  D10: { id: 'D10', title: '判斷回滾資料相容與安全隔離', tutorial: '回滾前先檢查舊／新 schema；不安全時可隔離寫入或止損，不能靠服務綠燈猜。' },
  D04: { id: 'D04', title: '決定收手、加碼或失敗後轉向', tutorial: '成功也要選穩交或貪心；失敗不只重按同一顆按鈕。' },
  D11: { id: 'D11', title: '請客戶／產品負責人回覆交付範圍', tutorial: '負責人會依公開局勢核准、退回補件或建議縮限；模擬 agent 不能代簽。' },
  D05: { id: 'D05', title: '裁決真正根因與責任邊界', tutorial: '程式、錯誤需求與部署設定都可能說得有道理。' },
  D07: { id: 'D07', title: '重跑目前 revision 的回歸', tutorial: '測試只證明測過的版本；舊綠燈不是祖傳護身符。' },
  D06: { id: 'D06', title: '處理早期決策回來收帳', tutorial: '只處理對應具名後果，不會用萬用 repair 洗掉其他問題。' },
  D08: { id: 'D08', title: '整理值班交接與回復計畫', tutorial: '說清目前版、關閉開關、資料相容與下一班該看什麼。' },
  D09: { id: 'D09', title: '上線、有限維持、硬交或止損', tutorial: '結局先看服務與證據，再加凌晨三點的故事稱號。' },
});

export const STRATEGIES = Object.freeze({
  patch: { label: '補丁救火', token: 2, time: 1, stress: 1, ability: 'E', bonus: 8 },
  investigate: { label: '偵探根因', token: 2, time: 2, stress: 0, ability: 'A', bonus: 12 },
  refactor: { label: '局部重構', token: 3, time: 3, stress: 1, ability: 'E', bonus: 5 },
  rollback: { label: '回滾／關閉功能', token: 2, time: 1, stress: 1, ability: 'V', bonus: 3 },
});

export const CASE04_ENDINGS = Object.freeze({
  'C04-VERIFIED': { title: '祖傳程式今晚肯聽人話', text: '目前 revision、服務狀態、資料相容與回歸證據一致；可以交班，不必靠祈禱維運。' },
  'C04-LIMITED': { title: '回滾救世主，功能暫住冷凍庫', text: '核心服務保住了，限制與關閉功能也寫清楚；這是誠實維持，不是完整版成功。' },
  'C04-FAILED': { title: '問題解決了，產品也差點消失', text: '你選擇帶著公開缺口交付；事故沒有被文案洗成成功。' },
  'C04-STOP': { title: '凌晨三點的守夜人', text: '你保留現場、證據與回復方案後止損；至少下一班不用從 Slack 考古。' },
});
