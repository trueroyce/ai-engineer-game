# AI 工程接案遊戲

一款以軟體工程決策為核心的繁體中文敘事遊戲。你會選擇職涯模板、裝備工程卡片，在有限 Token、時間與風險下完成四個案件；每個選擇都可能在後續事件與結局回來找你。

**公開遊玩：** https://trueroyce.github.io/ai-engineer-game/

## 遊戲內容

- **案件 01｜先管好自己**：把模糊承諾整理成可驗證的工作範圍。
- **案件 02｜三份資料，一個真相**：處理互相矛盾的 CSV、代理分工與證據鏈。
- **案件 03｜大家都說「只改一點點」**：面對需求漂移、驗收範圍與版本承諾。
- **案件 04｜祖傳系統救援**：在時間壓力下處理回滾、資料相容與負責人核准。
- 6 種職涯模板、18 張工程卡片、角色立繪與表情、4 個場景背景，以及會回應過往選擇的結局。
- 進度保存在瀏覽器 `localStorage`；重新整理後可延續同一局。

## 快速開始

### 直接遊玩公開版

1. 開啟[公開網頁](https://trueroyce.github.io/ai-engineer-game/)。
2. 建立職涯，選擇角色模板。
3. 從 18 張卡片中裝備本案要用的卡。
4. 進入案件，閱讀場景、成本與風險，再做決策。
5. 結局頁會顯示結果、特色稱號與本局紀錄。

更完整的操作與四案提示請見[玩家教學](docs/public/player-guide.md)。

### 本機執行

需求：Git、Node.js 24 以上；專案沒有第三方 npm 相依套件，不需 `npm install`。Windows 建議使用內附啟動器，固定沿用 `127.0.0.1:8091`，避免因更換 port 看見另一份 localStorage：

```powershell
git clone https://github.com/trueroyce/ai-engineer-game.git
cd ai-engineer-game
.\Start-AIEngineerGame.cmd
```

啟動器會檢查 Node.js、辨識並沿用正確的既有服務、拒絕終止占用 8091 的無關程序，確認遊戲資產與本機 coach/MCP capability 後再開啟瀏覽器。停止請執行：

```powershell
.\Stop-AIEngineerGame.cmd
```

不用啟動器時可執行 `npm start -- 8091`，保持終端機開啟並以 `Ctrl+C` 停止。完整依賴、重開機、port／存檔注意事項與 Claude Code 設定請見 [Windows 本機安裝與啟動](docs/public/local-install.md)。

## 存檔、重玩與結局

- 職涯、卡片與進行中的案件保存在目前瀏覽器和網域的本機儲存空間。
- 同一案件可重新挑戰；舊版合法存檔會盡量維持相容。
- 成功、有限交付與失敗都有不同收尾；失敗通常仍會提供有代價的補救路線，而不是只顯示「答錯」。
- 公開版不會把遊戲紀錄傳到伺服器或外部模型。

## 本機賽後分析與唯讀 MCP

GitHub Pages 是純靜態公開版，**不啟用賽後教練、MCP、Claude 呼叫、寫入伺服器或任何 localhost 探測**。這些功能只在你自行 clone 後，以 `npm start` 啟動的 loopback 本機版本使用。

本機版本可以：

- 把已結束的局存入專案下的 `runs/`；Git 會忽略實際 `*.json` 紀錄。
- 透過固定的唯讀 MCP 工具 `list_runs`、`get_run`、`get_rules` 讀取紀錄。
- 在使用者主動按下分析按鈕後，以已登入的 Claude Code 訂閱執行一次分析；沒有登入、額度不足、逾時或 MCP 錯誤時會明確失敗，不會假裝已分析。
- 只傳送該局必要的工程決策紀錄；不包含姓名、帳號、瀏覽器資料或聊天紀錄。

詳細設定、配額與隱私界線請見[MCP 與本機賽後教練教學](docs/mcp/README.md)。

## 測試

```powershell
npm test
npm run test:browser:career
npm run test:browser:case-04
npm run test:browser:phase29
npm run test:mcp
npm run test:local-coach
```

瀏覽器測試需要本機已安裝 Chrome 或 Edge。完整範圍與實際限制請見[測試指南](docs/public/testing.md)。

## 文件

- [玩家教學](docs/public/player-guide.md)
- [目前規格](docs/public/specification.md)
- [版本說明](docs/public/release-notes.md)
- [測試指南](docs/public/testing.md)
- [Claude Code 指令旁欄查核](docs/public/cli-reference.md)
- [Windows 本機安裝與啟動](docs/public/local-install.md)
- [AI 協作摘要](docs/public/ai-collaboration-summary.md)
- [貢獻與角色說明](CONTRIBUTORS.md)
- [MCP 與本機賽後教練](docs/mcp/README.md)

## AI 協作與作者界線

這個專案由人類提出方向、選擇設計、試玩並決定是否接受與發布；Anthropic Claude／Claude Code 完成初期 OpenSpec、第一版引擎／UI／測試的大部分實作與後續案件 01 敘事規劃，並參與兩輪唯讀美術方向討論；實作中斷後，OpenAI GPT／Codex 依使用者授權接手敘事四案、整合、測試、除錯、文件與視覺資產製作。Claude 另在本機提供玩家主動觸發的賽後分析。所有 AI 輸出都經過人類決策與實際驗證，不能視為自動完成或獨立作者。

GitHub 的 Contributors 圖表只會依 Git commit 的真實作者帳號自動產生。GPT 與 Claude 不是本專案的 GitHub 人類帳號，因此不會以假帳號、假 email、重寫歷史或新增協作者權限來製造圖表紀錄；實際貢獻改以本 README、[`CONTRIBUTORS.md`](CONTRIBUTORS.md) 與[AI 協作摘要](docs/public/ai-collaboration-summary.md)公開說明。

## 誠實限制與公開資料邊界

- 已測試 Chrome、Edge、桌面與 390px 行動版寬度，但不宣稱涵蓋所有瀏覽器、裝置與無限隨機種子。
- 公開儲存庫只包含遊戲原始碼、靜態資產、公開文件與測試；不包含使用者存檔、實際 `runs/*.json`、憑證、瀏覽器設定檔、原始私人對話或本機開發證據。
- 公開 Pages 版刻意不提供 MCP 與模型分析。要使用本機功能，請先閱讀文件並自行確認傳送範圍與 Claude Code 配額。

## 授權

本專案目前未另外宣告開源授權；除非儲存庫後續加入授權檔，請不要把「可公開瀏覽」解讀為可任意重製或重新授權。
