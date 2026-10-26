import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('案件 02 有獨立頁面、樣式與職涯模式入口', async () => {
  const [html, main, renderV2, renderBase] = await Promise.all([
    read('../../case-02.html'),
    read('../../src/case-02/main.js'),
    read('../../src/case-02/render-v2.js'),
    read('../../src/case-02/render.js'),
  ]);
  const render = `${renderV2}\n${renderBase}`;
  assert.match(html, /case-02\.css/);
  assert.match(html, /src\/case-02\/main\.js/);
  assert.match(main, /params\.get\('mode'\) === 'career'/);
  assert.match(main, /settleCase\(career, state\)/);
  assert.match(render, /data-case02-cancel/);
  assert.match(render, /data-return-lobby/);
});

test('玩家介面明示模擬邊界、公開來源與四種交付意圖', async () => {
  const render = await read('../../src/case-02/render.js');
  assert.match(render, /不會啟動真 sub-agent/);
  assert.match(render, /customers\.csv/);
  assert.match(render, /invoices\.csv/);
  assert.match(render, /refunds\.csv/);
  for (const intent of ['verified', 'limited', 'rush', 'stop']) {
    assert.match(render, new RegExp(`'${intent}'`));
  }
});

test('案件 02 沒有模型、外部網路或動態匯入依賴', async () => {
  const sources = await Promise.all([
    read('../../src/case-02/main.js'),
    read('../../src/case-02/engine.js'),
    read('../../src/case-02/engine-v2.js'),
    read('../../src/case-02/render.js'),
    read('../../src/case-02/render-v2.js'),
    read('../../src/case-02/rules.js'),
  ]);
  const joined = sources.join('\n');
  assert.doesNotMatch(joined, /\bfetch\s*\(/);
  assert.doesNotMatch(joined, /WebSocket|EventSource|claude|openai/i);
  assert.doesNotMatch(joined, /import\s*\(/);
});

test('契約、分工、變更、修復與測試都沒有預選正解', async () => {
  const [main, render] = await Promise.all([read('../../src/case-02/main.js'), read('../../src/case-02/render-v2.js')]);
  assert.match(main, /idPolicy: '', datePolicy: '', duplicatePolicy: ''/);
  assert.match(main, /strategy: ''/);
  assert.match(main, /response: ''/);
  assert.match(main, /mode: ''/);
  assert.match(main, /scope: ''/);
  assert.match(render, /請先作決定/);
  assert.match(render, /selectionComplete/);
});
