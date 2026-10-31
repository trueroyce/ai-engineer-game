import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('local start guide points to the accepted four-case candidate', () => {
  const readme = fs.readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  const guide = fs.readFileSync(new URL('../../docs/public/player-guide.md', import.meta.url), 'utf8');
  assert.match(readme, /案件 01｜先管好自己/);
  assert.match(readme, /案件 02｜三份資料，一個真相/);
  assert.match(readme, /案件 03｜大家都說/);
  assert.match(readme, /案件 04｜祖傳系統救援/);
  assert.match(guide, /四案提示/);
  assert.match(guide, /案件 04 一開始為什麼只有少數選項/);
});
