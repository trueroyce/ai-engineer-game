import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('接案大廳保留前三案並接入已實作第四案', async () => {
  const source = await read('../../src/career/main.js');
  assert.match(source, /管好自己/);
  assert.match(source, /三張表格，一份真相/);
  assert.match(source, /大家都說只改一點點/);
  assert.match(source, /昨天還好好的/);
  assert.match(source, /籌備中 · 沒有假按鈕/);
  assert.match(source, /case-02\.html\?mode=career/);
  assert.match(source, /case-03\.html\?mode=career/);
  assert.match(source, /case-04\.html\?mode=career/);
  assert.match(source, /enableCase02/);
  assert.match(source, /'02': \{ available: true/);
  assert.match(source, /'03': \{ available: true/);
  assert.match(source, /'04': \{ available: true/);
});

test('第一版入口保留，職涯首頁使用獨立程式與樣式', async () => {
  const [index, classic, casePage] = await Promise.all([read('../../index.html'), read('../../classic.html'), read('../../case-01.html')]);
  assert.match(index, /src\/career\/main\.js/);
  assert.match(index, /career\.css/);
  assert.match(classic, /src\/ui\/main\.js/);
  assert.match(classic, /styles\.css/);
  assert.match(casePage, /src\/narrative-ui\/main\.js/);
});

test('職涯模式與第一版 direct mode 由明確 query 參數隔離', async () => {
  const source = await read('../../src/narrative-ui/main.js');
  assert.match(source, /params\.get\('mode'\) === 'career'/);
  assert.match(source, /careerMode && !career/);
  assert.match(source, /saveCareer\(careerSettlement\.career\)/);
});
