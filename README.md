# AI 工程接案遊戲

一款不用真的燒掉 API 額度、但會讓你感受到接案精神壓力的單案敘事瀏覽器遊戲。

玩家先選擇工程師模板與工具卡，再處理一個看似簡單的待辦工具案件。需求理解、實作、驗證、修復與交付都有多種過程；角色能力、工具卡、公開案件狀態與隨機事件共同影響結果。遊戲不呼叫外部模型，也不會修改玩家電腦上的專案。

## 線上遊玩

[開啟 GitHub Pages 版本](https://trueroyce.github.io/ai-engineer-game/)

GitHub Pages 只包含靜態遊戲。唯讀 MCP 賽後教練需將專案 clone 到本機後使用。

## 本機啟動

需求：Node.js 24 或相容版本，以及現代 Chrome／Edge。

```powershell
npm start
```

開啟 `http://127.0.0.1:8080/`。根入口與 `case-01.html` 都進入同一個已驗收單案版本。

## 測試

```powershell
npm test
npm run test:mcp
npm run test:browser
npm run test:browser:visual
```

Edge 可將 browser 指令中的 `--browser chrome` 改成 `--browser edge`。

## 唯讀 MCP 賽後教練

遊戲結束後可匯出最小必要的公開局紀錄。把 JSON 放進本機 `runs/`，再依 [MCP 使用說明](docs/mcp/README.md) 將三個唯讀工具接入 Claude Code：

- `list_runs`
- `get_run`
- `get_rules`

MCP server 不呼叫模型、不需要 API key、不提供 shell、網路或寫入能力；局紀錄文字一律視為不可信資料。

## 公開版本範圍

這是從完整本機開發資料整理出的首次公開 release。公開 repo 只保留單案遊戲、唯讀 MCP、必要測試與整理後文件；原始對話、私人局檔、本機設定、完整測試 artifacts 與開發歷史仍留在使用者電腦。

- [遊戲規格摘要](docs/public/specification.md)
- [AI 協作摘要](docs/public/ai-collaboration-summary.md)
- [Release notes](docs/public/release-notes.md)

本 repo 尚未附加開源授權條款。
