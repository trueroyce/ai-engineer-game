# AI 工程接案遊戲

三個可重玩的 AI 工程接案模擬案件，包含跨案職涯、工具卡融合、分支事件、模擬 sub-agent／NPC 協作，以及三案共用的本機 Claude 賽後教練。

- 線上遊玩：https://trueroyce.github.io/ai-engineer-game/
- 線上版是純靜態遊戲，不呼叫模型、不提供本機教練，也不探測 localhost。
- 職涯只保存在同一瀏覽器、同一 profile、同一 origin 的 `localStorage`；進行中案件可在相同瀏覽器重新載入，沒有雲端同步或匯入／匯出職涯功能。

## 本機職涯擴充

接案大廳現在可玩三案：案件 01「管好自己」保留原規則；案件 02「三張表格，一份真相」提供 CSV 契約、模擬 sub-agent 分工、整合債、需求變更、交叉測試與來源追溯；案件 03「大家都說只改一點點」提供客戶決策、設計師／工程師 NPC 協作、介面契約、合併、需求變更與證據重驗。agent 與 NPC 都是確定性的遊戲模擬，不是真多人或背景模型服務。

職涯資料只保存在瀏覽器 `localStorage`。EXP、卡庫、融合等級與最多三張啟用卡跨案延續；Token、壓力與工作時間每次開案重設。三案都不會在遊玩過程啟動真模型、讀取外部 CSV 或連網。

```powershell
npm start
# 瀏覽 http://127.0.0.1:8080/
npm run test:browser:case-02
```

## 本機一鍵 Claude 賽後教練

GitHub Pages 只提供靜態遊戲，完全不顯示教練入口，也不會連到 `localhost`。要使用一鍵講評，請 clone 專案到本機，安裝 Node.js 24 以上與 Claude Code 2.1.310 以上，先在 Claude Code 完成一般訂閱登入，再從專案根目錄啟動：

```powershell
npm start -- 8081
```

開啟 `http://127.0.0.1:8081/`，從大廳選任一案件。案件 01、02、03 結算後都可按「分析這局」；本機 loopback server 會先把該局公開紀錄保存到固定 `runs/`，再以非互動 Claude Code 呼叫本專案的三個唯讀 MCP 工具，講評直接回到網頁。功能沿用 Claude Code 的既有登入，不需要另填雲端 API key。

按下分析會使用 Claude 帳號額度，且公開遊戲紀錄會傳送給 Claude 服務；這不是離線分析。紀錄不含姓名、帳號、seed、事件權重、隱藏缺陷或完整引擎狀態。橋接停用 Claude 的 Bash、Read、Edit、Web 等內建工具，只載入固定的 `ai_game_runs` 唯讀 MCP，並限制單次執行、turn、估算預算、時間與輸出大小。登入失效、額度不足、MCP 連線失敗、逾時或取消都會顯示失敗，不會假稱完成，也不會自動重試消耗額度。

同一伺服器程序中再次按一般分析會沿用已完成結果；只有按「重新分析（會再次使用額度）」才會再呼叫一次。手動 MCP 流程與資料界線詳見 `docs/mcp/README.md`。

> **目前狀態：三案職涯公開版。**
> 三案都有成功、部分成功、失敗、補救與止損路線；職涯包含起手三選一、兩次案內成長、跨案 EXP、卡庫、融合與最多三張啟用卡。

## 需求

- Node.js 24 以上（本專案以 v24.20.0 開發）。
- 任一現代瀏覽器（已用 Chrome 與 Edge 驗證）。
- **不需要安裝任何套件、不需要網路**：沒有 dependencies，介面不載入任何外部資源。

## 啟動（離線）

```powershell
git clone https://github.com/trueroyce/ai-engineer-game.git
cd ai-engineer-game
```

專案沒有第三方套件依賴，不需要執行 `npm install`。

```
npm start
```

終端機會印出 `http://127.0.0.1:8080/`，用瀏覽器開啟即可。要換埠號：`npm start -- 9000`（Windows PowerShell 亦同）。按 Ctrl+C 停止。

根入口 `http://127.0.0.1:8080/` 是三案職涯大廳；`case-01.html`、`case-02.html`、`case-03.html` 是案件頁。遊戲內的 Claude Code、agent 與 NPC 都是模擬內容，不會在遊玩過程呼叫模型或執行工具。

職涯會保存完整進行中案件供同一瀏覽器重新載入；案件結算後會保存 EXP、卡庫、融合與各案裝備。經典第一案仍不保存進行中遊戲。案件結束後可把最小公開局紀錄存入本機 `runs/`，但局紀錄只供賽後教練唯讀分析，不能恢復職涯。

## 唯讀 MCP 賽後教練

以 `npm start` 執行本機版時，案件 01、02、03 結束後都可按「存入本機賽後教練」，由同源 loopback server 直接把合法 `ai-engineer-game.run.v1` JSON 寫進固定 `runs/`。三案分別使用已知規則版 `case-01-narrative@2`、`case-02-csv@2`、`case-03-booking@1`；未知規則版或案件／規則不相符會被拒絕。檔案只含本局公開遊戲資料，不含姓名、帳號、金鑰、seed、未揭露缺陷或完整引擎 state。本機 stdio MCP 可用三個唯讀工具 `list_runs`、`get_run`、`get_rules` 供既有 Claude Code 分析。

唯讀 MCP server 本身不呼叫模型、不連網、不需 API key，也不能寫檔、刪檔或執行 shell；「只存到本機」也只經過窄寫入橋接，不會啟動 Claude。只有玩家明確按下「分析這局」時，一鍵分析 bridge 才會啟動受限的非互動 Claude Code，使用帳號額度讀取該局公開紀錄與三個唯讀 MCP 工具。完整安全邊界、真實協定測試與需人工核准的 project-scoped Claude Code 範本請見 `docs/mcp/README.md`。遊戲不會替使用者接受權限。

GitHub Pages 等純靜態版本不渲染賽後教練入口，也不包含可寫入本機的設定。

## 測試

```
npm test
```

執行全部 `node:test` 單元／整合測試（規則、亂數、公式、引擎時序、防重送、視圖遮罩、重播、兩條 18 回合黃金重播、40 種子整局、UI 渲染）。

只跑敘事案件單元測試：

```
npm run test:narrative
```

舊的單案切片回歸：

```
npm run test:browser
```

完整 Chrome 瀏覽器回歸（含滑鼠、鍵盤、360px、兩條 18 回合整局、提前結算、崩潰、稽核模式與重播）：

```
npm run test:browser:full
```

Edge 可執行 `node tests/browser/full.browser.mjs --browser edge`；可見 Chrome 視窗可加 `--headed`。結果與截圖寫入 `docs/testing/artifacts/phase-03/`。

敘事案件 Chrome 回歸可執行 `npm run test:browser:narrative`；Edge 可執行 `node tests/browser/narrative.browser.mjs --browser edge`。結果與截圖寫入 `docs/testing/artifacts/phase-04/`。

唯讀 MCP 與局紀錄匯出（合成資料、真 stdio JSON-RPC 子程序）：

```powershell
npm run test:mcp
```

Chrome 匯出下載回歸：

```powershell
npm run test:browser:mcp
```

Edge 可執行 `node tests/browser/mcp-export.browser.mjs --browser edge`。結果、下載檔與截圖寫入 `docs/testing/artifacts/phase-18/`；它是瀏覽器自動化，不是真人試玩。

本機直接存檔橋接的單元／真 HTTP 安全測試與瀏覽器回歸：

```powershell
npm run test:local-coach
npm run test:browser:local-coach
```

Edge 可執行 `node tests/browser/local-coach.browser.mjs --browser edge`。

## 目錄

- `src/core/`：規則資料、亂數、公式、引擎、結算摘要、玩家／稽核視圖、紀錄與重播。瀏覽器與 Node 共用。
- `src/ui/`：完整三案介面、互動控制器、CLI 教學旁欄與畫面渲染；一般模式只接收玩家視圖。
- `src/narrative/` 與 `src/narrative-ui/`：案件 01 的隔離規則引擎、敘事內容與精簡介面，不改寫 v1 公式。
- `src/postgame/`、`src/local-coach/` 與 `src/mcp/`：最小公開局紀錄 schema／投影、本機固定 `runs/` 寫入橋接，以及固定 `runs/` 根的唯讀 stdio MCP。
- `runs/`：本機遊戲結束後直接存入的局紀錄；`*.json` 不進 Git。
- `tests/`：測試；`tests/golden/` 是由 canonical 試玩表抄錄的黃金重播資料；`tests/browser/` 是零依賴 CDP 瀏覽器驅動。
- `docs/mcp/`：本機三案賽後教練安裝、安全、隱私與額度說明。
- `docs/public/`：公開版本規格摘要、協作摘要與版本說明。

工具卡是遊戲虛構機制，不代表真實 Claude Code 功能。
