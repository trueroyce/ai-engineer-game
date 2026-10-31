export const CASE02_RULE_VERSION = 'case-02-csv@3';

export const CASE02_LIMITS = Object.freeze({
  token: 18,
  tokenCap: 24,
  stressCap: 10,
  deadline: 12,
});

export function case02StartingResources(templateId) {
  return Object.freeze({
    token: CASE02_LIMITS.token + (templateId === 'beginner' ? 4 : templateId === 'ultimate' ? 3 : 0),
    stress: 0,
    time: CASE02_LIMITS.deadline + (templateId === 'beginner' ? 2 : templateId === 'ultimate' ? 1 : 0),
    overtime: 0,
    workCount: 0,
  });
}

export const CASE02_ACTIONS = Object.freeze({
  B01: { id: 'B01', title: '先寫資料格式契約', group: 'contract', tutorial: '把三張表各自相信的世界，翻成同一份可驗收的欄位、日期與重複列規則。' },
  B02: { id: 'B02', title: '正規化三份 CSV', group: 'agents', tutorial: '模擬 agent 只做你交付的資料工作；agent 數量會改變時間、成本與整合債。' },
  B03: { id: 'B03', title: '合併成單一真相', group: 'integration', tutorial: '整合會照目前契約與 brief 落地，不會偷偷替你修正錯誤假設。' },
  B04: { id: 'B04', title: '處理 17:58 需求變更', group: 'change', tutorial: '退款新規則是客戶決策；agent 可以整理影響，但接受哪個契約版本必須由你決定。' },
  B05: { id: 'B05', title: '清掉整合債', group: 'repair', tutorial: '回到契約修正可以保留來源；直接刪列較快，但會留下不可逆的資料缺口。' },
  B06: { id: 'B06', title: '跑跨來源測試', group: 'tests', tutorial: '測試是證據，不是修復。資料變更後，舊測試會明確過期。' },
  B07: { id: 'B07', title: '建立來源追溯', group: 'audit', tutorial: '讓每個數字能回到來源列、mapping 版本與退款規則。' },
  B08: { id: 'B08', title: '把腦袋從 CSV 拔出來一下', group: 'rest', tutorial: '休息花時間但回復 Token 與壓力；Context 管理卡會放大恢復。' },
  B09: { id: 'B09', title: '交付、限縮或止損', group: 'delivery', tutorial: '結果只依目前公開證據判定；不會因角色變強而暗中提高門檻。' },
  B10: { id: 'B10', title: '把失敗縮成可救的範圍', group: 'story', tutorial: '原型、砍範圍與硬做有不同代價；卡片可開特殊救援，但沒有卡仍能繼續。' },
  B11: { id: 'B11', title: '主流程通了，要接客服臨時表嗎？', group: 'story', tutorial: '穩交、改善或追加來源；冒險會留下之後真的回來找你的承諾。' },
  B12: { id: 'B12', title: '早先的決定回來敲門', group: 'story', tutorial: '只處理對應問題；修欄位分歧不會順便還原刪除資料或核准客戶決策。' },
});

export const CASE02_REWARD_ID = 'case-02:reward:integration-kit';
export const CASE02_REWARD_POOL = Object.freeze(['C1', 'C3', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12']);
// Legacy engine compatibility; the active v2 wrapper builds a filtered draw from the full pool.
export const CASE02_REWARD_CHOICES = CASE02_REWARD_POOL;

export const CONTRACT_OPTIONS = Object.freeze({
  idPolicy: Object.freeze([
    { value: 'canonical-map', label: 'customer_id ↔ client_no 對照表', aligned: true },
    { value: 'email', label: '直接用 email 當共同 ID', aligned: false },
  ]),
  datePolicy: Object.freeze([
    { value: 'normalize-iso', label: '全部正規化為 ISO 日期', aligned: true },
    { value: 'keep-source', label: '保留各表原格式', aligned: false },
  ]),
  duplicatePolicy: Object.freeze([
    { value: 'latest-export', label: '同發票只採最新匯出列', aligned: true },
    { value: 'sum-every-row', label: '看到幾列就全部加總', aligned: false },
  ]),
});

export const NORMALIZATION_STRATEGIES = Object.freeze({
  solo: { value: 'solo', label: '獨作：一個人慢慢對', token: 2, time: 3, stress: 0, baseDebt: 0 },
  one: { value: 'one', label: '一個模擬 agent：分掉格式整理', token: 3, time: 2, stress: 1, baseDebt: 0 },
  two: { value: 'two', label: '兩個模擬 agent：三表並行', token: 4, time: 1, stress: 2, baseDebt: 1 },
});
