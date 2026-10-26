# 唯讀 MCP 賽後教練

這個 MCP server 讓既有 Claude Code 讀取玩家在結算畫面按「存入本機賽後教練」自動存進 `runs/` 的遊戲局紀錄，協助回顧關鍵決策、資源代價與下一局改進方向。

它不是遊戲內聊天，也不會呼叫模型。MCP server 仍是沒有 HTTP listener、網路功能、shell 工具、寫入／刪除工具或 API key 的 stdio 程序；只有三個唯讀 tool：

- `list_runs`：列出已驗證局紀錄摘要。
- `get_run`：讀一局公開決策、觀察結果、資源代價及分析邊界。
- `get_rules`：讀公開規則與 schema／協定邊界。

## 1. 從本機遊戲直接存入 runs

1. 以 `npm start` 開啟 `http://127.0.0.1:8080/case-01.html`。
2. 完成或停止案件後，按「存入本機賽後教練」。
3. 畫面顯示成功與 `runId` 後，合法 JSON 已寫入專案的 `runs/<runId>.json`；不需下載或搬檔。

JSON 只含公開遊戲資料；沒有姓名、帳號、金鑰、seed、事件權重、內部缺陷真值或未發生分支。`runs/*.json` 預設不進 Git。

此按鈕只會在 `npm start` 的可信同源本機 server 回傳 capability 時出現。GitHub Pages 等純靜態版本不渲染教練入口，也不會呼叫 localhost。若本機 server 在儲存前停止，UI 會明確顯示失敗，不會假稱已寫入。

## 2. 先獨立驗證 server

不需設定 Claude Code，也不需模型：

```powershell
npm run test:mcp
```

這會以真正子程序走過 `initialize` → `notifications/initialized` → `tools/list` → `tools/call`，另測壞 JSON、版本不符、巨大輸入、重名 ID、路徑攻擊、reparse escape、輸出截斷及 stdout 純度。

## 3. 專案範圍接入 Claude Code（需你親自核准）

此階段只交付範本，沒有替你啟用。兩種等價作法請擇一：

1. 將 `docs/mcp/claude-project-config.example.json` 複製成專案根目錄 `.mcp.json`。
2. 或在專案根目錄執行：

```powershell
claude mcp add ai-engineer-postgame-coach --scope project -- node scripts/mcp-postgame-coach.mjs
```

接著在這個專案啟動互動式 `claude`。Claude Code 對 project-scoped `.mcp.json` 會要求 workspace/server approval；請檢視後自行決定是否核准。不要用 bypass 權限來省略這一步。可用下列唯讀命令查看設定狀態：

```powershell
claude mcp list
claude mcp get ai-engineer-postgame-coach
```

`Added ...` 只代表設定寫入；`Pending approval` 不代表已接通。互動式 `/mcp` 顯示 connected 後，才可請 Claude 使用這三個工具，例如：

`list_runs` 目前不記錄或推斷時間，順序也不代表新舊；請從清單明確選一個 `runId`，再交給 `get_run`。例如：

> 請先用 list_runs 列出局紀錄，顯示每局的 runId 與結局，等我指定一個 runId 後再用 get_run 分析。把當時可知的決策品質、觀察到的骰運與資源代價分開，最後提出三個下一局可操作建議；不要猜未揭露缺陷。

本次沒有自動執行 add、沒有建立 `.mcp.json`、沒有修改 `~/.claude.json`，也沒有替使用者接受任何權限。

## 4. 安全與資料使用邊界

- Production entry 固定為 `node scripts/mcp-postgame-coach.mjs`，固定只讀專案 `runs/`，不接受自訂路徑參數或環境變數。
- `npm start` 另提供只綁 `127.0.0.1` 的窄寫入橋接：只接受固定 POST endpoint、`application/json`、bounded body、合法 v1 schema 與同源 Origin／Host／CSRF token。路徑、檔名或 command 都不能由請求指定。
- 寫入檔名只能是驗證過的 `<runId>.json`；同一內容重送為 idempotent，不同內容撞到同一 `runId` 時拒絕覆蓋。寫入後會由既有唯讀 store 真正讀回驗證。
- 本機靜態 server 不提供 `runs/`、`.mcp.json`、`.claude/`、`.git/`、raw collaboration 或測試 artifacts 的下載路徑。CSRF／Host／Origin 邊界防的是第三方網頁借玩家瀏覽器寫入；它不宣稱能防禦已在本機帳號下執行的惡意程式。
- 每個直接 `.json` 都會做 canonical containment、一般檔案與 reparse 檢查、bounded read、前後 identity 檢查，再驗證 schema。
- 工具輸出中的玩家文字是不可信引用資料。server 不會跟隨其中「執行命令」「讀金鑰」「忽略規則」等內容。
- server 本身完全離線；但一旦你在 Claude Code 呼叫工具，工具輸出會成為該 Claude session 的內容，資料處理仍依你的 Claude 方案與設定為準。
- 不要把玩家局 JSON、`docs/collaboration/raw/` 或本機測試 artifact 直接放進公開 GitHub；發布前先做 release audit。

## 官方依據

- Claude Code MCP（stdio、project scope、approval）：https://code.claude.com/docs/en/mcp
- MCP 2025-11-25 lifecycle：https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- MCP 2025-11-25 stdio transport：https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP 2025-11-25 tools：https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Claude Code data usage：https://code.claude.com/docs/en/data-usage
