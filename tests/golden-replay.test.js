// 黃金重播（外部算例，design.md D12）。本階段（單案垂直切片）只跑 J1 前綴：
// rush_revised 第 1–3 回合、careful_revised 第 1–6 回合。全 18 回合屬 tasks 5.2／5.3，尚未執行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import rush from './golden/rush-revised.fixture.js';
import careful from './golden/careful-revised.fixture.js';
import { runGolden } from './golden/runner.js';

test('fixture 完整性：骰數與 D12 一致、回合 1..18 連續', () => {
  assert.equal(rush.successDice.length, 12);
  assert.equal(rush.defectDice.length, 9);
  assert.equal(careful.successDice.length, 15);
  assert.equal(careful.defectDice.length, 9);
  assert.deepEqual(careful.successDice.slice(0, 12), rush.successDice, 'careful 的前 12 個成功骰與 rush 相同');
  assert.deepEqual(careful.defectDice, rush.defectDice);
  for (const fx of [rush, careful]) {
    assert.deepEqual(fx.turns.map((r) => r.turn), Array.from({ length: 18 }, (_, i) => i + 1));
    const usedS = fx.turns.filter((r) => r.s).map((r) => r.s[0]);
    const usedH = fx.turns.filter((r) => r.h).map((r) => r.h[0]);
    assert.deepEqual(usedS, Array.from({ length: fx.successDice.length }, (_, i) => i + 1), `${fx.name} 成功骰索引連續`);
    assert.deepEqual(usedH, Array.from({ length: fx.defectDice.length }, (_, i) => i + 1), `${fx.name} 秘密骰索引連續`);
    for (const r of fx.turns) {
      if (r.s) assert.equal(fx.successDice[r.s[0] - 1], r.s[1], `${fx.name} 第 ${r.turn} 回合成功骰值`);
      if (r.h) assert.equal(fx.defectDice[r.h[0] - 1], r.h[1], `${fx.name} 第 ${r.turn} 回合秘密骰值`);
    }
  }
});

test('黃金重播 J1 前綴：rush_revised 第 1–3 回合（趕工＋C2、交付、Lv2 選 C4）', () => {
  const s = runGolden(rush, { uptoTurn: 3 });
  assert.equal(s.projects.J1.status, 'delivered');
  assert.deepEqual(s.equipped, [{ id: 'C5', level: 1 }, { id: 'C2', level: 1 }, { id: 'C4', level: 1 }]);
  assert.equal(s.rng.success.cursor, 2);
  assert.equal(s.rng.defect.cursor, 2);
});

test('黃金重播 J1 前綴：careful_revised 第 1–6 回合（分析、實作、驗證、Lv2 C5 升 L2、最後工期交付）', () => {
  const s = runGolden(careful, { uptoTurn: 6 });
  assert.equal(s.projects.J1.status, 'delivered');
  assert.deepEqual(s.equipped, [{ id: 'C5', level: 2 }, { id: 'C2', level: 1 }]);
  assert.equal(s.rng.success.cursor, 5);
  assert.equal(s.rng.defect.cursor, 3);
});

// ---- tasks 5.2／5.3／5.4：全 18 回合 ----

test('5.2 黃金重播 rush_revised 全 18 回合：終局 2 分、XP9/Lv4、T12/S8、初階接案', () => {
  const s = runGolden(rush, { uptoTurn: 18 });
  assert.equal(s.ending.name, '初階接案');
  assert.deepEqual([s.score, s.xp, s.level, s.token, s.stress], [2, 9, 4, 12, 8]);
});

test('5.3 黃金重播 careful_revised 全 18 回合：終局 6 分、XP10/Lv4、T0/S6、穩定交付', () => {
  const s = runGolden(careful, { uptoTurn: 18 });
  assert.equal(s.ending.name, '穩定交付');
  assert.deepEqual([s.score, s.xp, s.level, s.token, s.stress], [6, 10, 4, 0, 6]);
});

test('5.4 兩條黃金重播：任一事件的玩家投影都不含秘密骰與 H；稽核事件保留秘密骰', async () => {
  const { projectPlayerEvent } = await import('../src/core/view.js');
  for (const fx of [rush, careful]) {
    const s = runGolden(fx, { uptoTurn: 18 });
    const secret = s.events.flatMap((e) => e.dice.filter((d) => d.stream === 'defect'));
    assert.equal(secret.length, fx.defectDice.length, `${fx.name} 稽核事件含全部秘密骰`);
    for (const e of s.events) {
      const pe = JSON.stringify(projectPlayerEvent(e));
      assert.doesNotMatch(pe, /hiddenDefects|defectAdded|"defect"/, `${fx.name} 事件 #${e.seq}`);
    }
  }
});
