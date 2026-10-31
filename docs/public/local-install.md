# Windows 本機安裝與啟動

## 要選公開版還是本機版？

- **公開版（瀏覽器直接玩）**：<https://trueroyce.github.io/ai-engineer-game/>。不需安裝，不會啟動 localhost、寫入 `runs/`、連接 MCP 或呼叫 Claude。
- **本機完整版**：從 GitHub clone 後在 `http://127.0.0.1:8091/` 執行。可保存已結束的局到專案 `runs/`，並在你主動按下按鈕時使用 Claude 賽後教練。

瀏覽器進度按「協定＋主機＋port」分開保存。若已在 `http://127.0.0.1:8091/` 遊玩，請持續使用 **8091**；換成 8080、8093 或其他 port，看起來會像另一份全新存檔。啟動器不會偷偷換 port。

## 需求

1. [Git for Windows](https://git-scm.com/download/win)
2. [Node.js](https://nodejs.org/) 24 以上（遊戲沒有第三方 npm dependencies，不需 `npm install`）
3. 選用：[Claude Code](https://code.claude.com/docs/en/overview) 2.1.310 以上。只有賽後分析需要；先在終端執行 `claude` 並依官方流程登入。遊戲不要求另填 API key。
4. Chrome 或 Edge。

只安裝官方來源的 Git、Node.js 與 Claude Code；不要下載來路不明的「遊戲安裝包」或把帳號憑證放進專案。

## 第一次安裝

在 PowerShell 執行：

```powershell
git clone https://github.com/trueroyce/ai-engineer-game.git
cd ai-engineer-game
.\Start-AIEngineerGame.cmd
```

啟動器會：

1. 固定使用 `127.0.0.1:8091`，保留同一個瀏覽器 origin 的存檔。
2. 若正確版本已在執行，安全沿用，不再開第二個 server。
3. 若 8091 被其他程式或不同版本占用，顯示 PID 並停止；**不會殺掉程序，也不會改 port**。
4. 新啟動前檢查 Node.js 版本，並提示 Claude Code 是否存在。
5. 啟動後確認遊戲資產與 HTTP coach/MCP capability，再開瀏覽器。

Claude Code 未安裝或未登入時，四個案件仍可完整遊玩、保存與重玩；只有你按下「分析這局」時會得到明確錯誤，不會假裝分析成功。

## 每次啟動、停止與重開機

- 啟動：雙擊 `Start-AIEngineerGame.cmd`。
- 停止：雙擊 `Stop-AIEngineerGame.cmd`。它只會停止通過遊戲版本、capability 與命令列三重檢查的 8091 Node 程序；不會刪除瀏覽器存檔或 `runs/`。
- 電腦重開後：server 不會自行常駐，重新雙擊 `Start-AIEngineerGame.cmd` 即可。
- 若桌面捷徑指向此啟動器，也可直接雙擊桌面捷徑。

不使用啟動器時，也可在專案根目錄執行：

```powershell
npm start -- 8091
```

保持該終端機開啟；按 `Ctrl+C` 停止。

## 本機 HTTP bridge 與 stdio MCP

本機 `npm start -- 8091` 同時提供：

- loopback HTTP 遊戲頁面；
- 把玩家明確選擇保存到 `runs/` 的受限 HTTP bridge；
- 玩家主動按下分析後，啟動 Claude Code 並傳入臨時、唯讀 MCP 設定；
- `list_runs`、`get_run`、`get_rules` 三個唯讀 MCP 工具。

分析 bridge 會直接使用目前 Windows 使用者的 Claude Code 登入與配額；沒有登入、額度不足、逾時或 MCP 失敗時會明確顯示錯誤。它不會自動分析，也不會在只開啟遊戲時把存檔送給 Claude。

若要在一般 Claude Code 專案 session 中手動使用相同的 stdio MCP，可在專案根目錄自行執行：

```powershell
claude mcp add ai-engineer-postgame-coach --scope project -- node scripts/mcp-postgame-coach.mjs
claude mcp list
```

Claude Code 會要求你自行核准 project-scoped MCP；不要繞過核准。完整資料界線與故障模式請見 [MCP 與本機賽後教練](../mcp/README.md)。

## 常見問題

### 顯示「8091 已被占用」

啟動器只會沿用「同一份本機資產＋正確 capability」的遊戲服務。若是其他程式或不同版本，它會拒絕操作並顯示 PID。請先確認占用者；不要為了避開訊息隨手換 port，否則瀏覽器會使用另一份 localStorage。

### 開啟後像是新存檔

先確認網址完全相同：`http://127.0.0.1:8091/`。`localhost:8091`、`127.0.0.1:8080` 和 GitHub Pages 都是不同 origin，彼此不共用 localStorage。

### 賽後分析不能用

確認：

```powershell
node --version
claude --version
claude mcp list
```

Node.js 應為 24 以上；Claude Code 應已依官方流程登入。即使分析不可用，遊戲、職涯 localStorage 與本機 `runs/` 仍不應被清除。

