# 唯讀 MCP 賽後教練

> 目前公開 run schema、匯出與 MCP 講評只支援案件 01。案件 02、03 的職涯玩法已公開，但不會渲染講評入口，也不會假裝產生可供這組工具讀取的局紀錄。

本機版的主要流程是一鍵講評：玩家在結算頁按「分析這局」，loopback server會把已驗證的最小公開局紀錄存進固定`runs/`並回讀，再以受限的非互動Claude Code呼叫本專案三個唯讀MCP工具；結構化結果會直接顯示回遊戲頁面。完成一次project-scoped MCP核准後，日常不需另開Claude視窗或手動貼runId。

這個按鈕會使用目前Claude Code登入帳號的額度，並把所選局的公開遊戲紀錄送到Claude服務，因此不是離線分析。它依賴正常訂閱帳號登入，不需另設API key，也不使用`--bare`或跳過權限模式。GitHub Pages沒有本機capability，完全不渲染教練入口，也不會呼叫localhost。

底層MCP server本身仍只負責讀取`runs/`，不會呼叫模型、連網、執行shell或寫入檔案；它只有三個唯讀tool：

- `list_runs`：列出已驗證局紀錄摘要。
- `get_run`：讀一局公開決策、觀察結果、資源代價及分析邊界。
- `get_rules`：讀公開規則與 schema／協定邊界。

## 1. 首次啟用本機一鍵講評

本次驗證環境是 Windows、Node.js 24.20.0 與 Claude Code 2.1.310；這些是驗證環境，不是任意版本的最低需求，其他版本與作業系統未獨立驗證。

首次使用請先安裝：

- [Git for Windows](https://git-scm.com/install/windows)
- [Node.js](https://nodejs.org/en/download)
- [Claude Code](https://code.claude.com/docs/en/setup)

開啟新的 PowerShell，檢查版本與橋接固定查找的 Claude Code 路徑：

```powershell
git --version
node --version
$claude = "$env:USERPROFILE\.local\bin\claude.exe"
& $claude --version
```

現有橋接只查找 Windows 預設的 `%USERPROFILE%\.local\bin\claude.exe`；安裝在其他位置會明確回報橋接不可用。目前不承諾其他作業系統或安裝路徑。

尚未下載專案時，先執行：

```powershell
git clone https://github.com/trueroyce/ai-engineer-game.git
cd ai-engineer-game
```

專案沒有第三方套件相依，不需要執行 `npm install`。

依 [Claude Code 官方登入說明](https://code.claude.com/docs/en/iam)，從專案目錄正常啟動 Claude Code。第一次啟動會引導你在瀏覽器完成登入；不需要另設 API key：

```powershell
& $claude
```

完成登入後退出互動視窗，在同一個專案根目錄加入 project-scoped MCP，並再次啟動 Claude Code：

```powershell
& $claude mcp add ai_game_runs --scope project -- node scripts/mcp-postgame-coach.mjs
& $claude
```

輸入 `/mcp`，檢查 server 名稱與命令確實是此專案的 `ai_game_runs`，再由使用者親自核准。不要使用 `--bare` 或跳過權限的參數。完成後可退出這個互動 Claude 視窗。

日常啟動：

```powershell
npm start -- 8081
```

開啟`http://127.0.0.1:8081/case-01.html`，完成或中止案件後按「分析這局」。成功時，合法JSON會寫入`runs/<runId>.json`並由同一唯讀store回讀，Claude講評直接顯示在頁面；不需下載、手動搬檔或另開Claude視窗。

JSON 只含公開遊戲資料；沒有姓名、帳號、金鑰、seed、事件權重、內部缺陷真值或未發生分支。`runs/*.json` 預設不進 Git。

此按鈕只會在 `npm start` 的可信同源本機 server 回傳 capability 時出現。GitHub Pages 等純靜態版本不渲染教練入口，也不會呼叫 localhost。若本機 server 在儲存前停止，UI 會明確顯示失敗，不會假稱已寫入。

## 2. 先獨立驗證 server

不需設定 Claude Code，也不需模型：

```powershell
npm run test:mcp
```

這會以真正子程序走過 `initialize` → `notifications/initialized` → `tools/list` → `tools/call`，另測壞 JSON、版本不符、巨大輸入、重名 ID、路徑攻擊、reparse escape、輸出截斷及 stdout 純度。

## 3. 手動唯讀fallback（選用）

若一鍵流程暫時不可用，也可沿用手動唯讀MCP，不需再建立第二個server。若尚未完成上面的首次設定，在專案根目錄執行：

```powershell
& "$env:USERPROFILE\.local\bin\claude.exe" mcp add ai_game_runs --scope project -- node scripts/mcp-postgame-coach.mjs
```

接著在這個專案執行 `& "$env:USERPROFILE\.local\bin\claude.exe"` 啟動互動式 Claude Code。Claude Code 對 project-scoped `.mcp.json` 會要求 workspace/server approval；請檢視後自行決定是否核准。不要用 bypass 權限來省略這一步。可用下列唯讀命令查看設定狀態：

```powershell
claude mcp list
claude mcp get ai_game_runs
```

`Added ...` 只代表設定寫入；`Pending approval` 不代表已接通。互動式 `/mcp` 顯示 connected 後，才可請 Claude 使用這三個工具，例如：

`list_runs` 目前不記錄或推斷時間，順序也不代表新舊；請從清單明確選一個 `runId`，再交給 `get_run`。例如：

> 請先用 list_runs 列出局紀錄，顯示每局的 runId 與結局，等我指定一個 runId 後再用 get_run 分析。把當時可知的決策品質、觀察到的骰運與資源代價分開，最後提出三個下一局可操作建議；不要猜未揭露缺陷。

## 4. 安全與資料使用邊界

- Production MCP entry固定為`node scripts/mcp-postgame-coach.mjs`、固定只讀專案`runs/`，沒有接受自訂路徑參數或環境變數。
- 一鍵橋接固定從目前專案根目錄啟動Claude Code，不使用shell字串，也不接受網頁傳入prompt、路徑、command或flag。它啟用`--restricted`與`--strict-mcp-config`，停用內建Bash、Read、Edit、Web等工具，只允許`ai_game_runs`的三個唯讀tool，並限制同時一個子程序、turn、預算、時間與輸出大小。
- 登入、額度、MCP、權限、逾時與輸出錯誤都會安全分類並回到UI；不自動重試。取消只終止橋接自己啟動的子程序。相同局預設重用已完成結果，只有玩家明確按重新分析才會再次使用額度。
- `npm start` 另提供只綁 `127.0.0.1` 的窄寫入橋接：只接受固定 POST endpoint、`application/json`、bounded body、合法 v1 schema 與同源 Origin／Host／CSRF token。路徑、檔名或 command 都不能由請求指定。
- 寫入檔名只能是驗證過的 `<runId>.json`；同一內容重送為 idempotent，不同內容撞到同一 `runId` 時拒絕覆蓋。寫入後會由既有唯讀 store 真正讀回驗證。
- 本機靜態 server 不提供 `runs/`、`.mcp.json`、`.claude/`、`.git/`、raw collaboration 或測試 artifacts 的下載路徑。CSRF／Host／Origin 邊界防的是第三方網頁借玩家瀏覽器寫入；它不宣稱能防禦已在本機帳號下執行的惡意程式。
- 每個直接 `.json` 都會做 canonical containment、一般檔案與 reparse 檢查、bounded read、前後 identity 檢查，再驗證 schema。
- 工具輸出中的玩家文字是不可信引用資料。server 不會跟隨其中「執行命令」「讀金鑰」「忽略規則」等內容。
- server 本身完全離線；但一旦你在 Claude Code 呼叫工具，工具輸出會成為該 Claude session 的內容，資料處理仍依你的 Claude 方案與設定為準。
- 不要把玩家局 JSON、`docs/collaboration/raw/` 或本機測試 artifact 直接放進公開 GitHub；發布前先做 release audit。

## 官方依據

- Claude Code MCP（stdio、project scope、approval）：https://code.claude.com/docs/en/mcp
- Claude Code 安裝：https://code.claude.com/docs/en/setup
- Claude Code 登入：https://code.claude.com/docs/en/iam
- Git for Windows：https://git-scm.com/install/windows
- Node.js 下載：https://nodejs.org/en/download
- MCP 2025-11-25 lifecycle：https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- MCP 2025-11-25 stdio transport：https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP 2025-11-25 tools：https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- Claude Code data usage：https://code.claude.com/docs/en/data-usage

## 最短故障排除

- **找不到 Claude executable**：執行 `Test-Path "$env:USERPROFILE\.local\bin\claude.exe"`。若為 `False`，依官方安裝說明重新安裝到 Windows 預設位置；目前橋接不會搜尋其他路徑。
- **尚未登入或登入已失效**：在專案目錄執行 `& "$env:USERPROFILE\.local\bin\claude.exe"`，依瀏覽器提示完成正常登入，再回到遊戲重試。
- **MCP 顯示 `Pending approval` 或未連線**：在專案目錄啟動 Claude Code，輸入 `/mcp`，核對 `ai_game_runs` 的命令後親自核准；可用 `& "$env:USERPROFILE\.local\bin\claude.exe" mcp get ai_game_runs` 再查狀態。
