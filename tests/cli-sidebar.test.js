// R14 CLI 教學旁欄：真實用途與限制逐字取自公開查核文件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CLI_ROWS, CLI_CHECKED_DATE, CLI_NOTE, CLI_BOUNDARY } from '../src/ui/cli.js';

const publicReference = fs.readFileSync(new URL('../docs/public/cli-reference.md', import.meta.url), 'utf8');

test('五個指令與公開查核表逐列一致（真實用途、限制）', () => {
  assert.deepEqual(CLI_ROWS.map((r) => r.command), ['/context', '/compact', '/clear', '/rename', '/resume']);
  for (const r of CLI_ROWS) {
    assert.ok(publicReference.includes(`| ${r.command} | ${r.real} | ${r.limit} |`), `${r.command} 與公開查核文件不一致`);
    assert.ok(r.game.length > 0, `${r.command} 需有遊戲對照`);
  }
});

test('查核日期、未實跑聲明與虛構界線取自公開查核文件', () => {
  assert.equal(CLI_CHECKED_DATE, '2026-10-24');
  assert.ok(publicReference.includes('2026-10-24 查核'));
  assert.ok(publicReference.includes('未在使用者電腦實跑'));
  assert.ok(CLI_NOTE.includes('未在使用者電腦實跑'));
  assert.ok(publicReference.includes(CLI_BOUNDARY), CLI_BOUNDARY);
});
