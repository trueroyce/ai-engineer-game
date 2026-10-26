// Claude Code 教學旁欄（R14）。「真實用途」與「限制」逐字取自 docs/canonical/game-requirements.md §8；
// 「遊戲對照」只說明本遊戲有沒有可類比的操作，不新增任何遊戲機制或數值。
export const CLI_CHECKED_DATE = '2026-10-24';

export const CLI_NOTE = `以下真實用途於 ${CLI_CHECKED_DATE} 查核官方 Commands 及 Sessions 文件，未在使用者電腦實跑；實際可用指令會隨版本、平台及環境而異。`;

export const CLI_BOUNDARY = '「分析、趕工、需求筆記、快速原型、測試助手」是自然語言遊戲操作／自訂卡，不冒充官方slash command。';

export const CLI_ROWS = Object.freeze([
  { command: '/context', real: '查看上下文用量', game: '可類比：查看本遊戲的狀態列與行動預覽', limit: '不等於遊戲壓力表，也不顯示真實隱藏缺陷' },
  { command: '/compact', real: '摘要目前對話，可指定重點', game: '本版沒有對應的遊戲操作', limit: '不保證無損、不固定省某百分比Token；本輪無遊戲付費整理效果' },
  { command: '/clear', real: '開始新對話', game: '可類比：開始新局（會失去當局）', limit: '不等於刪專案檔、不讓遊戲時間與骰序倒退' },
  { command: '/rename', real: '命名工作階段', game: '本版沒有對應的遊戲操作', limit: '只是識別，不給EXP或資源' },
  { command: '/resume', real: '恢復或切換對話', game: '本版沒有對應的遊戲操作（首版不存檔）', limit: '不承諾重播中斷動作成功，不等於讀取遊戲存檔' },
]);
