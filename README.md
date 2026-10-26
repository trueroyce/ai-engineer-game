# AI 工程接案遊戲

一款不用真的燒掉 API 額度、但會讓你感受到接案精神壓力的單案敘事瀏覽器遊戲。

玩家先選擇工程師模板與工具卡，再處理一個看似簡單的待辦工具案件。需求理解、實作、驗證、修復與交付都有多種過程；角色能力、工具卡、公開案件狀態與隨機事件共同影響結果。靜態遊戲不呼叫外部模型，也不會修改玩家電腦上的專案；本機clone後可由玩家明確按下按鈕，選擇使用Claude Code做賽後講評。

## 線上遊玩

[開啟 GitHub Pages 版本](https://trueroyce.github.io/ai-engineer-game/)

GitHub Pages 只包含靜態遊戲，不渲染賽後教練入口，也不會呼叫 localhost。唯讀 MCP 賽後教練需將專案 clone 到本機後使用。

## 本機啟動

一般遊戲需求：Node.js 24或相容版本，以及現代Chrome／Edge。

要使用一鍵賽後講評，目前支援Windows，另需以官方安裝方式將Claude Code 2.1.310以上安裝於預設的`%USERPROFILE%\.local\bin\claude.exe`，並先用正常的Claude Code登入流程完成訂閱帳號登入。不需要另設API key，也不要使用`--bare`或跳過權限的參數。

```powershell
npm start -- 8081
```

開啟`http://127.0.0.1:8081/case-01.html`。根入口與`case-01.html`都進入同一個已驗收單案版本。

首次使用需依[MCP使用說明](docs/mcp/README.md)在這個clone完成一次project-scoped MCP核准。之後完成一局按「分析這局」，同源loopback server會先把已驗證的最小公開局紀錄寫入固定`runs/`並回讀，再以非互動Claude Code呼叫本專案的三個唯讀MCP工具；結構化講評會直接顯示在遊戲頁面，日常不需另開Claude視窗或貼runId。

按下分析會使用目前Claude Code帳號的額度，並把該局的公開遊戲紀錄送到Claude服務；這不是離線分析。登入失效、額度不足、MCP權限被拒、逾時或服務忙碌時會明示失敗，不會假裝完成，也不會自動重試消耗額度。相同局會重用已完成結果；只有玩家明確選擇重新分析才會再次呼叫。

## 測試

```powershell
npm test
npm run test:mcp
npm run test:local-coach
npm run test:browser
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

這是從完整本機開發資料整理出的首次公開 release。公開 repo 只保留單案遊戲、唯讀 MCP、必要測試與整理後文件；原始對話、私人局檔、本機設定、完整測試 artifacts 與開發歷史仍留在使用者電腦。

- [遊戲規格摘要](docs/public/specification.md)
- [AI 協作摘要](docs/public/ai-collaboration-summary.md)
- [Release notes](docs/public/release-notes.md)

本 repo 尚未附加開源授權條款。
