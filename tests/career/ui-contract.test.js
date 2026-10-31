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

test('職涯首頁移除舊版連結，但舊版頁面與樣式仍保留', async () => {
  const [index, main, classic, casePage, legacyLauncher] = await Promise.all([read('../../index.html'), read('../../src/career/main.js'), read('../../classic.html'), read('../../case-01.html'), read('../../Start-AIEngineerGame-Legacy.cmd')]);
  assert.match(index, /src\/career\/main\.js/);
  assert.match(index, /career\.css/);
  assert.doesNotMatch(main, /href="\.\/classic\.html"/);
  assert.doesNotMatch(main, /href="\.\/case-01\.html"/);
  assert.match(classic, /src\/ui\/main\.js/);
  assert.match(classic, /styles\.css/);
  assert.match(casePage, /src\/narrative-ui\/main\.js/);
  assert.match(legacyLauncher, /Start-AIEngineerGame\.cmd" -NoBrowser/);
  assert.match(legacyLauncher, /127\.0\.0\.1:8091\/classic\.html/);
});

test('職涯模式與第一版 direct mode 由明確 query 參數隔離', async () => {
  const source = await read('../../src/narrative-ui/main.js');
  assert.match(source, /params\.get\('mode'\) === 'career'/);
  assert.match(source, /careerMode && !career/);
  assert.match(source, /saveCareer\(careerSettlement\.career\)/);
});

test('Windows 啟動批次檔保留 ASCII 控制層與原生 CRLF', async () => {
  const [attributes, ...launchers] = await Promise.all([
    read('../../.gitattributes'),
    read('../../Start-AIEngineerGame.cmd'),
    read('../../Stop-AIEngineerGame.cmd'),
    read('../../Start-AIEngineerGame-Legacy.cmd'),
  ]);
  assert.match(attributes, /^\*\.cmd -text whitespace=cr-at-eol$/m);
  for (const source of launchers) {
    assert.equal(source.replaceAll('\r\n', '').includes('\n'), false);
    assert.equal([...source].every((character) => character.codePointAt(0) < 128), true);
  }
  assert.match(launchers[0], /-ExecutionPolicy Bypass/);
  assert.match(launchers[0], /exit \/b %launcherExit%/);
});
