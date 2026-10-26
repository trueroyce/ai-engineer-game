# AI 工程接案遊戲

一款在純靜態 GitHub Pages 遊玩時不用燒 API 額度、但會讓你感受到接案精神壓力的三案職涯瀏覽器遊戲；本機案件 01 的一鍵 Claude 賽後講評則會使用登入帳號的額度。

玩家建立一個獨立職涯，選擇工程師角色與最多三張啟用工具卡，再自由挑選三個已實作案件。EXP、卡庫與融合等級跨案保留，Token、時間與壓力則每案重設；角色能力、工具卡、公開案件狀態與隨機事件共同影響結果。靜態遊戲不呼叫外部模型，也不會修改玩家電腦上的專案。

## 線上遊玩

[開啟 GitHub Pages 版本](https://trueroyce.github.io/ai-engineer-game/)

GitHub Pages 只包含靜態遊戲，不渲染賽後教練入口，也不會呼叫 localhost。職涯只存在該網址、瀏覽器與使用者設定檔的 `localStorage`；案件結算並回到大廳後才保存，未結束案件不保存，也沒有雲端同步或職涯匯入／匯出。唯讀 MCP 賽後教練需將專案 clone 到本機後使用。

## 本機啟動

以下流程適用 Windows。本次公開版是在 Node.js 24.20.0、Claude Code 2.1.310 與現代 Chrome／Edge 完成驗證；這些是驗證環境，不是任意版本的最低需求，其他版本與作業系統尚未獨立驗證。

### 1. 安裝並檢查工具

- [Git for Windows 官方安裝頁](https://git-scm.com/install/windows)
- [Node.js 官方下載頁](https://nodejs.org/en/download)
- [Claude Code 官方安裝說明](https://code.claude.com/docs/en/setup)

安裝後開啟新的 PowerShell，檢查版本與橋接需要的 Claude Code 預設路徑：

```powershell
git --version
node --version
& "$env:USERPROFILE\.local\bin\claude.exe" --version
```

現有橋接只查找 Windows 預設的 `%USERPROFILE%\.local\bin\claude.exe`；即使 `claude` 在 PATH 中可用，安裝在其他位置仍會明確回報橋接不可用。目前不承諾其他作業系統或安裝路徑。

### 2. 下載專案

```powershell
git clone https://github.com/trueroyce/ai-engineer-game.git
cd ai-engineer-game
```

專案沒有第三方套件相依，不需要執行 `npm install`。

### 3. 登入 Claude Code 並核准 MCP

依 [Claude Code 官方登入說明](https://code.claude.com/docs/en/iam)，先從專案目錄啟動 Claude Code；第一次啟動會引導你在瀏覽器完成正常登入：

```powershell
$claude = "$env:USERPROFILE\.local\bin\claude.exe"
& $claude
```

完成登入後退出互動視窗，在同一個專案目錄加入 project-scoped MCP，再次啟動 Claude Code：

```powershell
& $claude mcp add ai_game_runs --scope project -- node scripts/mcp-postgame-coach.mjs
& $claude
```

在 Claude Code 輸入 `/mcp`，確認 `ai_game_runs` 指向本專案的 `scripts/mcp-postgame-coach.mjs`，再親自核准。不要使用 `--bare` 或跳過權限的參數。完整設定與故障排除請見 [MCP 使用說明](docs/mcp/README.md)。

### 4. 啟動遊戲

```powershell
npm start -- 8081
```

開啟 `http://127.0.0.1:8081/` 進入三案職涯大廳。案件 01、02、03 都可直接選擇；`case-01.html` 仍可直接進入第一案。

首次使用需依[MCP使用說明](docs/mcp/README.md)在這個clone完成一次project-scoped MCP核准。之後完成案件 01 按「分析這局」，同源loopback server會先把已驗證的最小公開局紀錄寫入固定`runs/`並回讀，再以非互動Claude Code呼叫本專案的三個唯讀MCP工具；結構化講評會直接顯示在遊戲頁面，日常不需另開Claude視窗或貼runId。案件 02、03 目前沒有對應 run schema、匯出或 MCP 講評，介面不會假裝支援。

按下分析會使用目前Claude Code帳號的額度，並把該局的公開遊戲紀錄送到Claude服務；這不是離線分析。登入失效、額度不足、MCP權限被拒、逾時或服務忙碌時會明示失敗，不會假裝完成，也不會自動重試消耗額度。相同局會重用已完成結果；只有玩家明確選擇重新分析才會再次呼叫。

## 測試

```powershell
npm test
npm run test:mcp
npm run test:local-coach
npm run test:browser
npm run test:browser:career
npm run test:browser:case-02
npm run test:browser:case-03
npm run test:browser:visual
npm run test:browser:local-coach
```

Edge 可將 browser 指令中的 `--browser chrome` 改成 `--browser edge`。

## 本機一鍵Claude賽後教練

橋接只綁定`127.0.0.1`，固定以目前專案根目錄為工作目錄，且只接受同源、受CSRF保護、固定schema與大小上限的請求。網頁不能提供prompt、路徑、命令或Claude參數。Claude子程序不載入Bash、Read、Edit、Web或其他MCP，只能使用：

- `list_runs`
- `get_run`
- `get_rules`

這三個MCP工具本身仍完全唯讀；寫入局檔的是受限本機遊戲端點，不是MCP tool。橋接會限制同時只能一個分析、turn數、預算、時間與輸出大小，取消時只終止自己啟動的子程序。局紀錄與模型回覆一律當作不可信資料顯示，不會執行其中的指令。

完整啟用、資料邊界、故障排除與手動唯讀fallback請見[MCP使用說明](docs/mcp/README.md)。GitHub Pages沒有本機capability，因此完全不渲染這個入口，也不會呼叫localhost。

## 公開版本範圍

這是從完整本機開發資料整理出的乾淨公開 release。公開 repo 只保留三案遊戲與職涯、案件 01 的唯讀 MCP／本機講評、必要測試與整理後文件；原始對話、私人局檔、本機設定、完整測試 artifacts 與完整開發歷史仍只留在使用者電腦。

- [遊戲規格摘要](docs/public/specification.md)
- [AI 協作摘要](docs/public/ai-collaboration-summary.md)
- [Release notes](docs/public/release-notes.md)

本 repo 尚未附加開源授權條款。
