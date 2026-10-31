import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStream, createStreams, drawD100, drawSample, uniformBelow, randomSeed } from '../src/core/rng.js';

function drawMany(stream, n) {
  const out = [];
  let s = stream;
  for (let i = 0; i < n; i++) {
    const r = drawD100(s);
    out.push(r.value);
    s = r.stream;
  }
  return { values: out, stream: s };
}

test('同種子產生同序列；不同種子不同', () => {
  const a = drawMany(createStream({ seed: 20261024 }), 50).values;
  const b = drawMany(createStream({ seed: 20261024 }), 50).values;
  const c = drawMany(createStream({ seed: 20261025 }), 50).values;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('抽骰是純函式：回傳新序列狀態，原狀態不變，索引從 1 起遞增', () => {
  const s0 = createStream({ seed: 7 });
  const snapshot = structuredClone(s0);
  const r1 = drawD100(s0);
  assert.deepEqual(s0, snapshot);
  assert.equal(r1.index, 1);
  assert.equal(drawD100(r1.stream).index, 2);
  assert.equal(r1.stream.cursor, 1);
});

test('三條序列互不推進', () => {
  const streams = createStreams({ success: { seed: 1 }, defect: { seed: 2 }, card: { seed: 3 } });
  const before = structuredClone(streams);
  const r = drawD100(streams.success);
  assert.equal(r.stream.cursor, 1);
  assert.deepEqual(streams.defect, before.defect);
  assert.deepEqual(streams.card, before.card);
});

test('d100 值域 1..100，且大量抽樣涵蓋全部 100 個值', () => {
  const { values } = drawMany(createStream({ seed: 12345 }), 20000);
  assert.ok(values.every((v) => Number.isInteger(v) && v >= 1 && v <= 100));
  assert.equal(new Set(values).size, 100);
});

test('uniformBelow 以拒絕取樣避免取模偏差', () => {
  // 2^32 = 4294967296；n=100 時可接受上限 4294967200，>= 上限的值須重抽。
  const feed = [4294967295, 4294967200, 4294967199];
  let i = 0;
  const v = uniformBelow(() => feed[i++], 100);
  assert.equal(i, 3, '前兩個值應被拒絕');
  assert.equal(v, 4294967199 % 100);
});

test('注入序列依序取值、用盡即拋錯、不循環', () => {
  let s = createStream({ values: [76, 23] });
  const r1 = drawD100(s);
  assert.deepEqual([r1.value, r1.index, r1.designated], [76, 1, true]);
  const r2 = drawD100(r1.stream);
  assert.deepEqual([r2.value, r2.index], [23, 2]);
  assert.throws(() => drawD100(r2.stream), /注入序列已用盡/);
});

test('注入骰值必須是 1..100 整數', () => {
  assert.throws(() => createStream({ values: [0] }), /1\.\.100/);
  assert.throws(() => createStream({ values: [101] }), /1\.\.100/);
  assert.throws(() => createStream({ values: [3.5] }), /1\.\.100/);
});

test('無放回抽樣：結果不重複、來自池、數量正確；池不足時全給', () => {
  const pool = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  let s = createStream({ seed: 99 });
  for (let i = 0; i < 200; i++) {
    const r = drawSample(s, pool, 4);
    s = r.stream;
    assert.equal(r.value.length, 4);
    assert.equal(new Set(r.value).size, 4);
    assert.ok(r.value.every((x) => pool.includes(x)));
    assert.equal(r.designated, false);
  }
  const small = drawSample(createStream({ seed: 1 }), ['C1', 'C2'], 3);
  assert.deepEqual([...small.value].sort(), ['C1', 'C2']);
});

test('無放回抽樣是均勻的（每張卡被抽中的次數接近 4/6）', () => {
  const pool = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  const counts = Object.fromEntries(pool.map((p) => [p, 0]));
  let s = createStream({ seed: 2026 });
  const N = 6000;
  for (let i = 0; i < N; i++) {
    const r = drawSample(s, pool, 4);
    s = r.stream;
    for (const x of r.value) counts[x]++;
  }
  for (const p of pool) {
    const ratio = counts[p] / N;
    assert.ok(Math.abs(ratio - 4 / 6) < 0.03, `${p} 比例 ${ratio}`);
  }
});

test('指定候選組標 designated，並驗證合法性', () => {
  const pool = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
  const s = createStream({ values: [['C1', 'C2', 'C5', 'C4']] });
  const r = drawSample(s, pool, 4);
  assert.deepEqual(r.value, ['C1', 'C2', 'C5', 'C4']);
  assert.equal(r.designated, true);
  assert.equal(r.index, 1);
  assert.throws(() => drawSample(createStream({ values: [['C1', 'C1', 'C2', 'C3']] }), pool, 4), /指定候選/);
  assert.throws(() => drawSample(createStream({ values: [['C1', 'C2', 'C3']] }), pool, 4), /指定候選/);
  assert.throws(() => drawSample(createStream({ values: [['C1', 'C2', 'C3', 'C9']] }), pool, 4), /指定候選/);
});

test('randomSeed 產生 32 位元無號整數', () => {
  const s = randomSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff);
});
