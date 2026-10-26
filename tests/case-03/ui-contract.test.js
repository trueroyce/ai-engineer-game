import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('案件 03 是獨立職涯頁面，標示 NPC/agent 皆為模擬且沒有外部依賴', async () => {
  const [html, main, render] = await Promise.all([read('case-03.html'), read('src/case-03/main.js'), read('src/case-03/render.js')]);
  assert.match(html, /src\/case-03\/main\.js/);
  assert.match(render, /不會連線多人、啟動 CLI 或呼叫模型/);
  assert.doesNotMatch(main + render, /fetch\(|WebSocket|EventSource|https?:\/\//);
});

test('所有需要決策的工作均從空選擇開始，確認鈕依選擇停用', async () => {
  const [main, render] = await Promise.all([read('src/case-03/main.js'), read('src/case-03/render.js')]);
  assert.match(main, /options = \{\}/);
  assert.match(render, /complete\(actionId, options\)/);
  assert.match(render, /disabled/);
  assert.doesNotMatch(main, /scope: 'full'|intent: 'verified'|strategy: 'pair'/);
});

test('大廳把三案標為可玩且進階不是門鎖', async () => {
  const source = await read('src/career/main.js');
  assert.match(source, /'03': \{ available: true/);
  assert.match(source, /case-03\.html\?mode=career/);
  assert.match(source, /進階」只是提示，不是門鎖/);
});
