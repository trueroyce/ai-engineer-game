# AI 協作摘要

這個公開版本是一次由人類主導決策，並由 Claude Code、Codex 與獨立測試角色共同完成的 AI 工程實驗。AI 提供方案、程式與檢查，人類負責選擇方向、界定可讀取資料、親自試玩並決定是否接受與發布。

## 分工

- 使用者決定遊戲方向、玩法回饋、卡片節奏、角色難度、敘事方式與公開範圍，並親自試玩多輪。
- Claude Code 參與早期 OpenSpec 規劃與部分實作探索；後續經使用者逐檔授權，讀取限定的 UI／美術原始碼，完成兩輪唯讀設計討論，提出立繪、場景、卡片、資訊層級、行動版與無障礙取捨。它也只在本機、使用者主動按下分析時擔任賽後教練。
- Codex 負責主要程式整合：四案敘事與狀態、存檔相容、卡片融合、平衡 cohort、MCP、角色與場景美術資產、響應式 UI、除錯、測試、發布整理與文件。
- 獨立 reviewer 及真瀏覽器 playtester 多次找出背景圖載入、已選卡片對比、案件 04 路線、rollback／相容 preflight、負責人核准、runId、空白結局稱號、資源標籤與 MCP 邊界問題；每一個阻擋都先保留重現，再修復回歸。

## 開發方法

- 使用 OpenSpec 維護 proposal、design、requirements 與 tasks。
- 以固定 seed、合法玩家路徑和公開狀態 policy 驗證平衡，不使用隱藏真值 oracle 代替玩家決策。
- 區分文字走查、單元測試、瀏覽器自動化與真人試玩，不把其中一種冒充另一種。
- 重要修復保留 red-first 證據、完整回歸與本機 Git checkpoint。
- Claude 的設計建議沒有直接修改程式；Codex 整合後仍需人類試玩與獨立 QA 才能接受。

## 公開與私人資料界線

公開 repo 是整理後的乾淨 release，不假裝成完整私人開發檔案。原始 prompt／response、私人路徑、雲端識別、局檔、完整 artifacts、瀏覽器設定與環境設定仍保留在使用者本機，沒有放上 GitHub。公開 Pages 也不會呼叫 MCP、localhost 或外部模型。

AI 的貢獻以 README、`CONTRIBUTORS.md` 與本摘要誠實記錄；不使用假 GitHub 帳號、假 email 或重寫歷史來製造 Contributors 圖表。
