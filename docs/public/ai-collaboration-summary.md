# AI 協作摘要

這個公開版本是一次由人類主導決策，並由 Claude Code、Codex 與獨立測試角色共同完成的 AI 工程實驗。AI 提供方案、程式與檢查，人類負責選擇方向、界定可讀取資料、親自試玩並決定是否接受與發布。

## 分工

- 使用者決定遊戲方向、玩法回饋、卡片節奏、角色難度、敘事方式與公開範圍，並親自試玩多輪。
- Claude Code 是初期 OpenSpec 與第一版程式的主寫者，而不只是規劃顧問：它實作了單案垂直切片的引擎、UI、玩家／稽核視圖、重播與測試，並在下一階段寫出完整第一版的大部分程式與測試。該階段在最終回應前中斷，Codex只補兩個小範圍瀏覽器測試修正與文件／驗證收尾。
- Claude 之後完成案件 01 敘事版的 OpenSpec 規劃；實作回合長時間沒有交付產品程式後，使用者明確授權切換 Codex。Codex完成案件 01 敘事實作與後續案件 02–04、存檔相容、卡片融合、平衡 cohort、MCP、響應式 UI、除錯、測試、發布整理與文件。
- 美術階段另有兩輪 Claude 唯讀設計討論，提出立繪、場景、卡片、資訊層級、行動版與無障礙取捨；Codex負責實際資產製作、程式整合與回歸。這兩輪唯讀限制只適用於美術審查，不代表 Claude 在初期沒有直接寫程式。
- 獨立 reviewer 及真瀏覽器 playtester 多次找出背景圖載入、已選卡片對比、案件 04 路線、rollback／相容 preflight、負責人核准、runId、空白結局稱號、資源標籤與 MCP 邊界問題；每一個阻擋都先保留重現，再修復回歸。

## 可核對的工具階段

- 初期 OpenSpec／第一版：Claude Code 2.1.303、Claude Opus 5.5。
- 兩輪唯讀美術審查：Claude Code 2.1.310、Claude Opus 5.5（medium）。
- Codex 的公開說明只記錄產品角色與可驗證工作，不宣稱平台內部模型名稱。
- 本機賽後 Claude 分析是發布後由玩家主動觸發的產品功能，與開發期的 Claude Code 貢獻分開計算。

## 開發方法

- 使用 OpenSpec 維護 proposal、design、requirements 與 tasks。
- 以固定 seed、合法玩家路徑和公開狀態 policy 驗證平衡，不使用隱藏真值 oracle 代替玩家決策。
- 區分文字走查、單元測試、瀏覽器自動化與真人試玩，不把其中一種冒充另一種。
- 重要修復保留 red-first 證據、完整回歸與本機 Git checkpoint。
- 美術階段的兩輪 Claude 建議沒有直接修改程式；初期第一版則確實由 Claude Code 寫入程式與測試。所有階段仍需人類試玩、取捨與獨立 QA 才能接受。

## 公開與私人資料界線

公開 repo 是整理後的乾淨 release，不假裝成完整私人開發檔案。原始 prompt／response、私人路徑、雲端識別、局檔、完整 artifacts、瀏覽器設定與環境設定仍保留在使用者本機，沒有放上 GitHub。公開 Pages 也不會呼叫 MCP、localhost 或外部模型。

AI 的貢獻以 README、`CONTRIBUTORS.md` 與本摘要誠實記錄；不使用假 GitHub 帳號、假 email 或重寫歷史來製造 Contributors 圖表。
