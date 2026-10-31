# 測試指南

## 基本測試

需求：Node.js 24 以上；瀏覽器回歸需要 Chrome 或 Edge。

```powershell
npm test
npm run test:mcp
npm run test:local-coach
```

`npm test` 執行所有 `node:test` 單元／契約測試，涵蓋四案規則、狀態、卡片、平衡、存檔、結局、圖片清單與 run schema。MCP 與本機教練另有獨立測試，避免把 stub 或 schema 測試誤稱為真模型端到端。

## 瀏覽器回歸

```powershell
npm run test:browser:career
npm run test:browser:case-04
npm run test:browser:phase29
npm run test:browser:natural
```

Edge 可直接執行同一支腳本並指定瀏覽器，例如：

```powershell
node tests/browser/redesign.browser.mjs --browser edge
node tests/browser/case-04.browser.mjs --browser edge
```

瀏覽器回歸包含：

- 正常大廳 → 模板 → 卡片 → 案件入口。
- 四案關鍵分支、失敗恢復、正式／有限／失敗結局。
- 重新整理、既有存檔、重複操作防護與鍵盤焦點。
- 桌面與 390px 寬度、圖片可見性、對比與 reduced-motion。
- 賽後保存、真實遊戲產生的 runId、四案分析按鈕與取消流程。

## 公開版檢查

發布到 GitHub Pages 後，應另外確認：

1. 首頁、六模板、十八卡與四案圖片均從公開網域成功載入。
2. 可正常開始四案、進行代表性選擇、進入結局並重新整理。
3. 結局稱號有可見文字，不是空白徽章。
4. 公開站不渲染本機教練按鈕，不向 localhost、MCP、Claude 或模型端點送出請求。
5. 390px 寬度仍能讀取對話、成本、路線圖與選項。

## 已知測試邊界

- 自動化與獨立 QA 已涵蓋 Chrome、Edge、桌面與 390px；沒有宣稱涵蓋所有瀏覽器、縮放比例、輔助技術與無限 seed。
- 平衡 cohort 是固定策略與 holdout seed 的統計證據，不代表每次亂選都一定成功。
- 真 Claude 測試只使用隔離的合成 QA 局，並與 stub／HTTP／stdio 契約測試分開記錄；公開 Pages 不執行真模型測試。
