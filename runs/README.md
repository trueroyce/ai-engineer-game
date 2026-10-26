# 賽後局紀錄（本機）

遊戲結束後按「匯出賽後教練紀錄」，瀏覽器會下載 `<runId>.json`。請把要分析的檔案手動移到這個資料夾，再由 MCP 的 `list_runs`／`get_run` 讀取。

- `runs/*.json` 已列入 `.gitignore`，不應提交或 push。
- MCP server 只讀這一層的 `.json`，不會寫入、搬動或刪除檔案。
- 只接受 `ai-engineer-game.run.v1` 與已知遊戲規則版本。
- 不要在 JSON 內加入姓名、帳號、金鑰或其他私人資料；server 也不需要任何 API key。
- 匯出文字一律視為不可信遊戲資料。它不會成為 server 指令。

這個目錄保留 `.gitkeep` 與本說明；玩家自己的 JSON 只留本機。
