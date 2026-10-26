# AI 協作摘要

這個公開版本是一次有人類決策、Claude Code、Codex 與獨立測試角色共同完成的 AI 工程實驗。

## 分工

- 使用者決定遊戲方向、玩法回饋、卡片節奏、角色難度、敘事方式與公開範圍，並親自試玩多輪。
- Claude Code 參與早期 OpenSpec 規劃及第一階段實作。長回合卡住後，依使用者授權改由 Codex 完成主要實作、修復與驗證。
- Codex 後續負責敘事引擎、狀態一致性、UI／美術、卡片融合、平衡 cohort、MCP、發布整理與測試。
- 獨立 reviewer 及真瀏覽器 playtester 多次找出 cache、rollback、修復入口、交付意圖、文案真值、卡片時點及 MCP 邊界問題；每一個阻擋都先保留重現，再修復回歸。

## 開發方法

- 使用 OpenSpec 維護 proposal、design、requirements 與 tasks。
- 以固定 seed、合法玩家路徑和公開狀態 policy 驗證平衡，不使用隱藏真值 oracle 代替玩家決策。
- 區分文字走查、單元測試、瀏覽器自動化與真人試玩，不把其中一種冒充另一種。
- 重要修復保留 red-first 證據、完整回歸與本機 Git checkpoint。

## 公開與私人資料界線

公開 repo 是整理後的乾淨 release，不是假裝成完整原始歷史。原始 prompt／response、私人路徑、雲端識別、局檔、完整 artifacts 與環境設定仍保留在使用者本機，沒有放上 GitHub。
