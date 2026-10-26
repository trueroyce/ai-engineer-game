# Release notes

## v1.0.1 — 本機賽後教練直接存檔

- 本機版結算畫面新增「存入本機賽後教練」，由同源 loopback server 將已驗證的公開局紀錄直接存入固定 `runs/`。
- 寫入端點限定 Host、Origin、same-origin fetch、CSRF、method、content type、body 大小與既有 schema；不接受請求指定的路徑、檔名或 command。
- 同一局重送不重複寫入；相同 `runId` 但不同內容會拒絕覆寫，成功後以既有唯讀 store 讀回驗證。
- MCP server 與 `list_runs`、`get_run`、`get_rules` 仍完全唯讀；遊戲不會自動呼叫 Claude Code 或模型。
- GitHub Pages 沒有本機 capability，因此不渲染教練入口、手動搬檔提示或本機設定，也不會呼叫 localhost。
- 本版不變更遊戲規則、平衡、文本、美術或結局條件。

## v1.0.0 — 首次整理公開版

來源基準：本機開發 commit `ba83b9ccbd077a98736eec93e1022ffac6f26568`。

### 包含

- 已驗收的單案敘事遊戲與 Debug Desk 漫畫辦公室介面。
- 六角色、六基礎卡、卡片融合、十二種工作、三十四事件及多層結局。
- 公開狀態案件面板、唯讀歷史、重做／修復流程與 responsive／keyboard／reduced-motion 支援。
- 玩家可下載的公開局紀錄。
- 固定根目錄、三工具、無依賴的唯讀 stdio MCP 賽後教練。
- narrative、MCP 與 Chrome／Edge browser 測試。

### 不包含

- 舊三案數值原型與尚未實作的第二案件。
- 原始開發對話、完整測試 artifacts、私人局檔或本機 Claude 設定。
- GitHub Pages 上的 MCP server；MCP 僅供本機 clone 後使用。

### 發布方式

公開版本使用新的乾淨 Git 歷史，沒有重寫或刪除原本保留在使用者電腦上的完整開發 repo。
